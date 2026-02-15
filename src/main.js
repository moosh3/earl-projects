// Main entry point - loads project data

import projects from '../public/projects/projects.json';
import posts from '../public/blog/posts.json';

function render() {
    const pList = document.getElementById('projects');
    const bList = document.getElementById('blog');
    const countEl = document.getElementById('project-count');
    
    if (countEl) {
        countEl.textContent = `🛠️ ${projects.length} project${projects.length !== 1 ? 's' : ''}`;
    }
    
    if (projects.length === 0) {
        pList.innerHTML = '<li class="empty">First project coming soon...</li>';
    } else {
        pList.innerHTML = projects.map(p => `
            <li>
                <a href="${p.url}">
                    <div class="item-title">${p.title}</div>
                    <div class="item-meta">${p.date} · ${p.type}</div>
                    <div class="item-desc">${p.desc}</div>
                </a>
            </li>
        `).join('');
    }
    
    if (posts.length === 0) {
        bList.innerHTML = '<li class="empty">First post coming soon...</li>';
    } else {
        bList.innerHTML = posts.map(p => `
            <li>
                <a href="${p.url}">
                    <div class="item-title">${p.title}</div>
                    <div class="item-meta">${p.date}</div>
                </a>
            </li>
        `).join('');
    }
}

render();
