'use strict';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = p => `{{ '${p}' | relative_url }}`;
function validate(businesses) {
  if (businesses.map(b => b.id).join(',') !== 'retail,coffee,bar') throw new Error('Expected retail, coffee and bar guides');
  const videos = new Set();
  for (const b of businesses) {
    if (!/^[\w-]{11}$/.test(b.youtubeId || '') || videos.has(b.youtubeId)) throw new Error(`Missing or duplicate video for ${b.id}`);
    videos.add(b.youtubeId);
    if (!b.steps?.length) throw new Error(`Missing tutorial for ${b.id}`);
  }
}
function video(b) {
  return `<figure class="pos-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(b.youtubeId)}" title="${esc(b.videoTitle)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><figcaption>Recorded in the real app using sample data and demo payments. <a href="https://www.youtube.com/watch?v=${esc(b.youtubeId)}">Watch on YouTube</a></figcaption></figure>`;
}
function section(b) {
  return `<section class="guide-chapter pos-business" id="${b.id}"><div class="pos-business-copy"><p class="eyebrow">${esc(b.sample)}</p><h2>${esc(b.title)}</h2><p class="chapter-intro">${esc(b.summary)}</p><ul class="guide-list">${b.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul><a class="btn" href="${url(`/point-of-sale/${b.id}/`)}">Follow the ${esc(b.title.toLowerCase())} tutorial →</a></div>${video(b)}</section>`;
}
function tutorial(b, businesses, publish) {
  const steps = b.steps.map((s,i) => {
    const image = s.shot && publish(s.shot);
    return `<section class="guide-chapter" id="step-${i+1}"><p class="eyebrow">Step ${i+1} of ${b.steps.length}</p><h2>${esc(s.title)}</h2><ol class="guide-list">${s.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>${image ? `<figure class="guide-shot"><a href="${url(image)}"><img src="${url(image)}" alt="${esc(s.caption || s.title)}" loading="lazy" width="1280" height="800"></a><figcaption>${esc(s.caption || s.title)} — sample shop</figcaption></figure>` : ''}</section>`;
  }).join('\n');
  return `---
layout: default
title: "Point of Sale — ${b.title} tutorial"
permalink: /point-of-sale/${b.id}/
body_class: guide
extra_css: /assets/pos-guide.css?v=20261019
description: "${b.summary}"
---
<section class="hero"><div class="wrap"><a href="${url('/point-of-sale/')}">← RobOS Point of Sale</a><p class="eyebrow">${esc(b.sample)} · Guided walkthrough</p><h1>${esc(b.title)} tutorial</h1><p class="lead">${esc(b.summary)}</p><p>Follow the example below, then adapt the catalog, team and payment settings for your business.</p>${video(b)}</div></section>
<section><div class="wrap"><div class="guide-layout"><nav class="guide-toc" aria-label="Tutorial steps"><h4>In this tutorial</h4><ol>${b.steps.map((s,i) => `<li><a href="#step-${i+1}">${esc(s.title)}</a></li>`).join('')}</ol><a href="${url('/point-of-sale/#guide')}">Shared setup and reference →</a></nav><div class="guide-body">${steps}<section class="guide-chapter"><h2>Keep going</h2><p><a href="${url('/point-of-sale/#guide')}">Read the shared guide</a> for installation, team permissions, cash settings, scanning, self-checkout and payment-provider limitations.</p><nav aria-label="Other business tutorials">${businesses.filter(other => other.id !== b.id).map(other => `<a href="${url(`/point-of-sale/${other.id}/`)}">${esc(other.title)} tutorial</a>`).join(' · ')}</nav></section></div></div></div></section>`;
}
module.exports = { validate, video, section, tutorial };
