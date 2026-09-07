/** External writes are at most one attempt per stage. Unknown outcomes need a
 * verified receipt, never an expiring lease that blindly re-sends a tweet. */
export async function publishIntent(initial, { store, send, now = Date.now, allowSend = true }) {
  let row = initial;
  let sentRoot = false;
  const advance = async (state, extra = {}) => {
    const next = await store.advance(row, state, extra);
    if (!next) return false; // Another invocation owns the next stage.
    row = next;
    return true;
  };
  const timely = () => {
    const lead = Date.parse(row.log_payload.commence_time) - now();
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(now()));
    return allowSend && Number.isFinite(lead) && lead >= 300000 && lead <= 7200000 && hour >= 8 && hour <= 23;
  };
  try {
    if (['completed','expired'].includes(row.state)) return { posted: false, state: row.state };
    if (row.state === 'root_sending') return { posted: false, error: 'PUBLICATION_SEND_UNCERTAIN' };
    if (row.state === 'prepared') {
      if (!timely()) {
        if (Date.parse(row.log_payload.commence_time) - now() < 300000) await advance('expired');
        return { posted: false, state: row.state };
      }
      if (!await advance('root_sending')) return { posted: false, state: 'claimed_elsewhere' };
      // The database claim itself may have taken us past the hard deadline.
      if (!timely()) { await advance('expired'); return { posted: false, state: row.state }; }
      const id = await send(row.log_payload.post_text);
      if (!id) throw new Error('PUBLICATION_SEND_UNCERTAIN');
      sentRoot = true;
      if (!await advance('root_sent', { hook_tweet_id: id, root_posted_at: new Date(now()).toISOString() })) {
        throw new Error('PUBLICATION_SEND_UNCERTAIN');
      }
    }
    // A root receipt is persisted before its reply, and independently of the log.
    // Upsert repairs a lost log response without resetting the original timestamp.
    await store.log(row);
    if (row.state === 'reply_sending') return { posted: sentRoot, error: 'PUBLICATION_REPLY_UNCERTAIN' };
    if (row.state === 'root_sent' && row.reply_text && timely()) {
      if (!await advance('reply_sending')) return { posted: sentRoot, state: 'claimed_elsewhere' };
      if (!timely()) { await advance('completed'); return { posted: sentRoot, state: row.state }; }
      const id = await send(row.reply_text, row.hook_tweet_id);
      if (!id) throw new Error('PUBLICATION_REPLY_UNCERTAIN');
      if (!await advance('reply_sent', { reply_tweet_id: id })) throw new Error('PUBLICATION_REPLY_UNCERTAIN');
      await store.log(row);
    }
    if (row.state === 'root_sent' && row.reply_text && Date.parse(row.log_payload.commence_time) - now() >= 300000) {
      return { posted: sentRoot, state: 'reply_deferred' };
    }
    // Do not issue a late reply; the already-published root remains a real receipt.
    await advance('completed');
    return { posted: sentRoot, state: row.state, thread_url: `https://x.com/BetwithGary/status/${row.hook_tweet_id}` };
  } catch (error) {
    return { posted: sentRoot, error: String(error) };
  }
}

export function publicationStore(sb) {
  return {
    async advance(row, state, extra) {
      const { data, error } = await sb.from('social_publication_intents').update({ state, ...extra, updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('state', row.state).select('*').maybeSingle();
      if (error) throw new Error('PUBLICATION_STATE_WRITE_FAILED');
      return data;
    },
    async log(row) {
      const { error } = await sb.from('social_post_log').upsert({ ...row.log_payload,
        post_date: row.post_date, publication_key: row.publication_key,
        hook_tweet_id: row.hook_tweet_id, reasoning_tweet_id: row.reply_tweet_id,
        cta_tweet_id: null, posted_at: row.root_posted_at,
        thread_url: `https://x.com/BetwithGary/status/${row.hook_tweet_id}`,
      }, { onConflict: 'post_date,publication_key', ignoreDuplicates: true });
      if (error) throw new Error('POST_LOG_WRITE_FAILED');
      const { data: receipt, error: receiptError } = await sb.from('social_post_log').select('hook_tweet_id')
        .eq('post_date', row.post_date).eq('publication_key', row.publication_key).maybeSingle();
      if (receiptError || receipt?.hook_tweet_id !== row.hook_tweet_id) throw new Error('POST_LOG_WRITE_FAILED');
      // A stale root-only worker cannot erase a reply another worker confirmed.
      if (row.reply_tweet_id) {
        const { data, error: replyError } = await sb.from('social_post_log').update({ reasoning_tweet_id: row.reply_tweet_id })
          .eq('post_date', row.post_date).eq('publication_key', row.publication_key).eq('hook_tweet_id', row.hook_tweet_id).select('id');
        if (replyError || data?.length !== 1) throw new Error('POST_LOG_WRITE_FAILED');
      }
    },
  };
}
