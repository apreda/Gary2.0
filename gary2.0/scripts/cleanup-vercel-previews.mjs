#!/usr/bin/env node
// Deletes old Vercel preview deployments for a project.
// Required env:
//  - VERCEL_TOKEN   (Personal token)
//  - VERCEL_PROJECT (Project name as shown in Vercel)
//  - VERCEL_TEAM    (optional team slug)

const token = process.env.VERCEL_TOKEN;
const project = process.env.VERCEL_PROJECT; // project slug/name OR projectId (prj_...)
const team = process.env.VERCEL_TEAM || '';

if (!token || !project) {
  console.error('Missing env. Set VERCEL_TOKEN and VERCEL_PROJECT (and optional VERCEL_TEAM).');
  process.exit(1);
}

const teamParam = team ? `&teamId=${encodeURIComponent(team)}` : '';
const headers = { Authorization: `Bearer ${token}` };

const isProjectId = project && project.startsWith('prj_');
const api = {
  listUrl: (cursor) => `https://api.vercel.com/v6/deployments?${isProjectId ? `projectId=${encodeURIComponent(project)}` : `app=${encodeURIComponent(project)}`}&limit=100${teamParam}${cursor ? `&from=${cursor}` : ''}`,
  delUrl: (id) => `https://api.vercel.com/v13/deployments/${id}${team ? `?teamId=${encodeURIComponent(team)}` : ''}`
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAllDeployments() {
  const all = [];
  let cursor = undefined;
  for (let i = 0; i < 10; i++) { // up to 1000 results
    const url = api.listUrl(cursor);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List deployments failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const deployments = data.deployments || data;
    all.push(...deployments);
    if (!data.pagination || !data.pagination.next) break;
    cursor = data.pagination.next;
    await sleep(50);
  }
  return all;
}

function byCreatedDesc(a, b) {
  const ca = a.createdAt ?? a.created ?? 0;
  const cb = b.createdAt ?? b.created ?? 0;
  return cb - ca;
}

async function removeDeployment(id, url) {
  const res = await fetch(api.delUrl(id), { method: 'DELETE', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete ${url} failed: ${res.status} ${text}`);
  }
}

async function main() {
  console.log(`🔎 Listing deployments for project: ${project}${team ? ` (team: ${team})` : ''}`);
  const all = await fetchAllDeployments();
  const previews = all.filter(d => d.target === 'preview');
  if (previews.length === 0) {
    console.log('No preview deployments found.');
    return;
  }
  previews.sort(byCreatedDesc);
  const keep = previews[0];
  const toDelete = previews.slice(1);
  console.log(`Found ${previews.length} previews. Keeping latest: ${keep?.url}. Deleting ${toDelete.length} older previews...`);

  let success = 0, fail = 0;
  for (const d of toDelete) {
    try {
      await removeDeployment(d.uid || d.id, d.url);
      console.log(`✓ Removed ${d.url}`);
      success++;
      await sleep(80);
    } catch (e) {
      console.error(`✗ Failed ${d.url}: ${e.message}`);
      fail++;
    }
  }
  console.log(`Done. Removed: ${success}, Failed: ${fail}.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});


