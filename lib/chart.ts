import type { Bucket } from './stats.ts';

const SVG = 'http://www.w3.org/2000/svg';

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function barChart(list: Bucket[], format: (value: number) => string, onPick: (bucket: Bucket | null) => void): HTMLElement {
  const width = 600;
  const height = 120;
  const top = 8;
  const bottom = 1;
  const max = Math.max(...list.map((bucket) => bucket.value), 0);
  const slot = width / Math.max(list.length, 1);
  const gap = slot > 8 ? Math.min(6, slot * 0.25) : 1;
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, class: 'wm-chart', role: 'img', preserveAspectRatio: 'none' });
  svg.append(node('line', { x1: 0, x2: width, y1: height - 0.5, y2: height - 0.5, class: 'wm-chart-axis' }));
  list.forEach((bucket, index) => {
    const barHeight = max ? Math.max(bucket.value > 0 ? 2 : 0, ((height - top - bottom) * bucket.value) / max) : 0;
    const x = index * slot + gap / 2;
    const hit = node('rect', { x: index * slot, y: 0, width: slot, height: height - bottom, class: 'wm-chart-hit' });
    const bar = node('rect', { x, y: height - bottom - barHeight, width: Math.max(slot - gap, 1), height: barHeight, rx: Math.min(3, (slot - gap) / 2), class: 'wm-chart-bar' });
    const title = node('title', {});
    title.textContent = `${bucket.label}: ${format(bucket.value)}, заказов ${bucket.count}`;
    hit.append(title);
    hit.addEventListener('pointerenter', () => {
      bar.classList.add('wm-chart-active');
      onPick(bucket);
    });
    hit.addEventListener('pointerleave', () => {
      bar.classList.remove('wm-chart-active');
      onPick(null);
    });
    svg.append(bar, hit);
  });
  const wrap = document.createElement('div');
  wrap.className = 'wm-chart-wrap';
  const labels = document.createElement('div');
  labels.className = 'wm-chart-labels';
  const picks = list.length > 2 ? [list[0], list[Math.floor((list.length - 1) / 2)], list[list.length - 1]] : list;
  for (const bucket of picks) {
    const label = document.createElement('span');
    label.textContent = bucket?.label ?? '';
    labels.append(label);
  }
  wrap.append(svg, labels);
  return wrap;
}
