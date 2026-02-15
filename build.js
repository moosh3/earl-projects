// Build script to generate static index from projects/ and blog/
// Run: node build.js

const fs = require('fs');
const path = require('path');

function getProjects() {
    const projectsDir = path.join(__dirname, 'projects');
    if (!fs.existsSync(projectsDir)) return [];
    
    return fs.readdirSync(projectsDir)
        .filter(f => f.endsWith('.html'))
        .map(f => {
            const content = fs.readFileSync(path.join(projectsDir, f), 'utf8');
            const titleMatch = content.match(/<title>(.+?)<\/title>/);
            const descMatch = content.match(/<meta name="description" content="(.+?)"/);
            return {
                title: titleMatch ? titleMatch[1] : f,
                desc: descMatch ? descMatch[1] : '',
                url: `projects/${f}`,
                date: f.split('-').slice(0, 3).join('-'),
                type: 'Project'
            };
        })
        .reverse();
}

function getPosts() {
    const blogDir = path.join(__dirname, 'blog');
    if (!fs.existsSync(blogDir)) return [];
    
    return fs.readdirSync(blogDir)
        .filter(f => f.endsWith('.html') || f.endsWith('.md'))
        .map(f => {
            const content = fs.readFileSync(path.join(blogDir, f), 'utf8');
            const titleMatch = content.match(/<title>(.+?)<\/title>/) || 
                              content.match(/^# (.+)$/m);
            return {
                title: titleMatch ? titleMatch[1] : f,
                url: `blog/${f}`,
                date: f.split('-').slice(0, 3).join('-')
            };
        })
        .reverse();
}

// Generate static data file
const data = {
    projects: getProjects(),
    posts: getPosts(),
    lastBuild: new Date().toISOString()
};

fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
fs.writeFileSync(
    path.join(__dirname, 'assets', 'data.json'),
    JSON.stringify(data, null, 2)
);

console.log(`Built: ${data.projects.length} projects, ${data.posts.length} posts`);
