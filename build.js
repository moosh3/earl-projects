// Build script to regenerate projects.json and posts.json
// Run: node build.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getProjects() {
    const projectsDir = path.join(__dirname, 'public', 'projects');
    if (!fs.existsSync(projectsDir)) return [];
    
    return fs.readdirSync(projectsDir)
        .filter(f => f.endsWith('.html') && f !== 'index.html')
        .map(f => {
            const content = fs.readFileSync(path.join(projectsDir, f), 'utf8');
            const titleMatch = content.match(/<title>(.+?)<\/title>/);
            const descMatch = content.match(/<meta name="description" content="(.+?)"/);
            const dateStr = f.split('-').slice(0, 3).join('-');
            return {
                title: titleMatch ? titleMatch[1].split(' — ')[0] : f,
                desc: descMatch ? descMatch[1] : '',
                url: `/projects/${f}`,
                date: dateStr,
                type: 'Project'
            };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getPosts() {
    const blogDir = path.join(__dirname, 'public', 'blog');
    if (!fs.existsSync(blogDir)) return [];
    
    return fs.readdirSync(blogDir)
        .filter(f => f.endsWith('.html'))
        .map(f => {
            const content = fs.readFileSync(path.join(blogDir, f), 'utf8');
            const titleMatch = content.match(/<title>(.+?)<\/title>/);
            const dateStr = f.split('-').slice(0, 3).join('-');
            return {
                title: titleMatch ? titleMatch[1].split(' — ')[0] : f,
                url: `/blog/${f}`,
                date: dateStr
            };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Generate JSON files
const projects = getProjects();
const posts = getPosts();

fs.writeFileSync(
    path.join(__dirname, 'public', 'projects', 'projects.json'),
    JSON.stringify(projects, null, 2)
);

fs.writeFileSync(
    path.join(__dirname, 'public', 'blog', 'posts.json'),
    JSON.stringify(posts, null, 2)
);

console.log(`Built: ${projects.length} projects, ${posts.length} posts`);
console.log(`Last build: ${new Date().toISOString()}`);
