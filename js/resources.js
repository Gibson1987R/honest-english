// resources.js — load and filter resources by CEFR level

async function loadResources() {
  const res = await fetch('data/resources.json');
  return await res.json();
}

function filterResourcesForLevel(resources, level) {
  if (!level || level === 'Pre-A1') level = 'A1';
  return resources
    .filter(r => r.levels.includes(level))
    .sort((a, b) => b.priority - a.priority);
}

function groupByCategory(resources) {
  const groups = {};
  resources.forEach(r => {
    if (!groups[r.category]) groups[r.category] = [];
    groups[r.category].push(r);
  });
  return groups;
}

const CATEGORY_LABELS = {
  speaking: '🗣 Speaking',
  listening: '🎧 Listening',
  reading: '📖 Reading',
  vocab: '📚 Vocabulary',
  pronunciation: '🔤 Pronunciation',
  community: '👥 Community'
};

const TYPE_BADGES = {
  free: { label: 'GRATIS', color: '#10b981' },
  paid: { label: 'PAGO', color: '#f59e0b' },
  freemium: { label: 'FREEMIUM', color: '#06b6d4' }
};

function renderResourceCard(r) {
  const typeBadge = TYPE_BADGES[r.type] || { label: r.type.toUpperCase(), color: '#6b7280' };
  return `
    <a href="${r.url}" target="_blank" class="resource-card">
      <span class="priority">★ ${r.priority}</span>
      <h4>${r.name}</h4>
      <p>${r.description}</p>
      <span class="tag" style="background:${typeBadge.color}25; color:${typeBadge.color}">${typeBadge.label}</span>
    </a>
  `;
}

function renderResourcesByCategory(resources) {
  const grouped = groupByCategory(resources);
  let html = '';
  // Order categories by importance for the user's situation
  const order = ['speaking', 'listening', 'pronunciation', 'reading', 'vocab', 'community'];
  for (const cat of order) {
    if (!grouped[cat]) continue;
    html += `<h3>${CATEGORY_LABELS[cat]}</h3>`;
    html += `<div class="resource-grid">${grouped[cat].map(renderResourceCard).join('')}</div>`;
  }
  return html;
}
