#!/usr/bin/env node
'use strict';

// Offline assembly only. The three reviewed website JPGs are never rewritten,
// cropped or overlaid. This is a still-image overview, not a screen recording.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const ffprobe = '/opt/homebrew/bin/ffprobe';
const names = ['01-find-your-game.jpg', '02-read-the-reasoning.jpg', '03-check-the-record.jpg'];
const sources = names.map(name => path.resolve(__dirname, '../exports', name));
const output = path.join(__dirname, 'gary-website-overview-30s.mp4');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe = file => JSON.parse(execFileSync(ffprobe, [
  '-v', 'error', '-show_entries',
  'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,nb_frames',
  '-of', 'json', file,
], { encoding: 'utf8', timeout: 10000 }));
const fail = message => { throw new Error(message); };

try {
  if (fs.existsSync(output)) fail('Output already exists; refusing to overwrite it.');
  const before = sources.map(file => {
    const stream = probe(file).streams.find(item => item.codec_type === 'video');
    if (!stream || stream.width !== 1280 || stream.height !== 720) fail('A source is not the reviewed 1280x720 image.');
    return sha256(file);
  });
  const inputArgs = sources.flatMap(file => ['-loop', '1', '-framerate', '30', '-t', '10', '-i', file]);
  execFileSync(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-n', ...inputArgs,
    '-filter_complex', '[0:v]setsar=1[v0];[1:v]setsar=1[v1];[2:v]setsar=1[v2];[v0][v1][v2]concat=n=3:v=1:a=0,scale=iw:ih:in_range=pc:out_range=tv,format=yuv420p[overview]',
    '-map', '[overview]', '-an', '-c:v', 'libx264', '-preset', 'medium',
    '-tune', 'stillimage', '-crf', '18', '-color_range', 'tv', '-r', '30', '-frames:v', '900',
    '-movflags', '+faststart', '-map_metadata', '-1',
    '-metadata', 'title=Gary website overview — historical September 7 examples',
    '-metadata', 'comment=Three unchanged website gallery images, ten seconds each. Still-image overview; not a continuous screen recording. No audio.',
    output,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  const metadata = probe(output);
  const video = metadata.streams.find(item => item.codec_type === 'video');
  if (!video || video.codec_name !== 'h264' || video.width !== 1280 || video.height !== 720
    || video.pix_fmt !== 'yuv420p' || video.r_frame_rate !== '30/1'
    || Number(video.nb_frames) !== 900 || Number(metadata.format.duration) !== 30
    || metadata.streams.some(item => item.codec_type === 'audio')) fail('Encoded format differs from the intended silent 30-second overview.');
  execFileSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-i', output, '-f', 'null', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  if (!sources.every((file, index) => sha256(file) === before[index])) fail('Source image integrity changed.');
  console.log(JSON.stringify({
    verified_at_utc: new Date().toISOString(),
    output: path.basename(output),
    output_sha256: sha256(output),
    bytes: Number(metadata.format.size),
    duration_seconds: 30,
    width: 1280,
    height: 720,
    fps: '30/1',
    frames: 900,
    codec: 'h264',
    pixel_format: 'yuv420p',
    audio: false,
    full_decode_passed: true,
    sources_unchanged: true,
    sources: names.map((name, index) => ({ file: '../exports/' + name, sha256: before[index], start_seconds: index * 10, duration_seconds: 10 })),
    presentation: 'Still-image website overview; historical September 7 examples, not a continuous screen recording.',
    published: false,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Overview assembly failed.');
  process.exitCode = 1;
}
