/**
 * Neural Constellation - Emergent Particle Simulation
 * 
 * Features:
 * - Boids flocking algorithm with separation, alignment, cohesion
 * - Dynamic neural network visualization
 * - Multiple interaction modes (attract/repel/orbit/chaos)
 * - Smooth particle morphing and color transitions
 * - Optimized spatial hashing for O(n) neighbor queries
 * - Perlin-noise inspired drift for organic movement
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
let config = {
    particleCount: 150,
    connectionRadius: 120,
    attractionStrength: 0.3,
    friction: 0.98,
    maxSpeed: 4,
    separationRadius: 30,
    alignmentRadius: 50,
    cohesionRadius: 100,
    mode: 'emergent' // emergent, neural, gravity, chaos
};

// State
let particles = [];
let mouse = { x: 0, y: 0, down: false };
let shockwaves = [];
let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

// Color palettes for different modes
const palettes = {
    emergent: ['#ff6b35', '#4ecdc4', '#a855f7', '#fbbf24', '#ec4899'],
    neural: ['#00ffff', '#0088ff', '#4400ff', '#8800ff', '#ff00ff'],
    gravity: ['#ffaa00', '#ff6600', '#ff2200', '#ff0044', '#ff0088'],
    chaos: ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00']
};

// Resize handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Simplex-like noise for organic drift
class SimpleNoise {
    constructor() {
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        for (let i = 0; i < 256; i++) this.perm[i + 256] = this.perm[i];
    }
    
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }
    
    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.perm[X] + Y, B = this.perm[X + 1] + Y;
        return this.lerp(v, 
            this.lerp(u, this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y)),
            this.lerp(u, this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1))
        );
    }
}

const noise = new SimpleNoise();

// Particle class with complex behaviors
class Particle {
    constructor(x, y) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.radius = 2 + Math.random() * 3;
        this.baseRadius = this.radius;
        this.hue = Math.random() * 360;
        this.energy = Math.random();
        this.phase = Math.random() * Math.PI * 2;
        this.id = Math.random();
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        // Assign color from palette
        const palette = palettes[config.mode];
        this.color = palette[Math.floor(Math.random() * palette.length)];
    }
    
    update(particles, time) {
        // Store old position for velocity calculation
        const oldVx = this.vx;
        const oldVy = this.vy;
        
        // Apply mode-specific forces
        switch(config.mode) {
            case 'emergent':
                this.applyFlocking(particles);
                this.applyNoiseDrift(time);
                break;
            case 'neural':
                this.applyNeuralBehavior(particles);
                break;
            case 'gravity':
                this.applyGravity(particles);
                break;
            case 'chaos':
                this.applyChaos(time);
                break;
        }
        
        // Mouse interaction
        this.applyMouseForce();
        
        // Apply shockwaves
        this.applyShockwaves();
        
        // Friction
        this.vx *= config.friction;
        this.vy *= config.friction;
        
        // Speed limit
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > config.maxSpeed) {
            this.vx = (this.vx / speed) * config.maxSpeed;
            this.vy = (this.vy / speed) * config.maxSpeed;
        }
        
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Boundary wrapping
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
        
        // Update energy based on movement
        this.energy = Math.min(1, this.energy * 0.99 + speed * 0.05);
        
        // Pulsing radius
        this.pulsePhase += 0.05 + this.energy * 0.1;
        this.radius = this.baseRadius * (1 + Math.sin(this.pulsePhase) * 0.3 + this.energy * 0.5);
    }
    
    applyFlocking(particles) {
        let sepX = 0, sepY = 0, sepCount = 0;
        let aliX = 0, aliY = 0, aliCount = 0;
        let cohX = 0, cohY = 0, cohCount = 0;
        
        for (let other of particles) {
            if (other === this) continue;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx * dx + dy * dy;
            
            // Separation
            if (distSq < config.separationRadius * config.separationRadius && distSq > 0) {
                const dist = Math.sqrt(distSq);
                sepX -= dx / dist;
                sepY -= dy / dist;
                sepCount++;
            }
            
            // Alignment
            if (distSq < config.alignmentRadius * config.alignmentRadius) {
                aliX += other.vx;
                aliY += other.vy;
                aliCount++;
            }
            
            // Cohesion
            if (distSq < config.cohesionRadius * config.cohesionRadius) {
                cohX += other.x;
                cohY += other.y;
                cohCount++;
            }
        }
        
        // Apply forces with weights
        if (sepCount > 0) {
            this.vx += (sepX / sepCount) * 0.15;
            this.vy += (sepY / sepCount) * 0.15;
        }
        if (aliCount > 0) {
            this.vx += (aliX / aliCount - this.vx) * 0.05;
            this.vy += (aliY / aliCount - this.vy) * 0.05;
        }
        if (cohCount > 0) {
            cohX /= cohCount;
            cohY /= cohCount;
            this.vx += (cohX - this.x) * 0.0005;
            this.vy += (cohY - this.y) * 0.0005;
        }
    }
    
    applyNeuralBehavior(particles) {
        // Seek connections, form network topology
        let targetX = 0, targetY = 0, count = 0;
        
        for (let other of particles) {
            if (other === this) continue;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < config.connectionRadius * config.connectionRadius * 2) {
                const weight = 1 / (1 + Math.sqrt(distSq) * 0.01);
                targetX += other.x * weight;
                targetY += other.y * weight;
                count += weight;
            }
        }
        
        if (count > 0) {
            targetX /= count;
            targetY /= count;
            this.vx += (targetX - this.x) * 0.001;
            this.vy += (targetY - this.y) * 0.001;
        }
        
        // Gentle drift
        this.vx += (Math.random() - 0.5) * 0.1;
        this.vy += (Math.random() - 0.5) * 0.1;
    }
    
    applyGravity(particles) {
        // Gravitational attraction to center + mutual attraction
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Attraction to center (weak)
        const dx = centerX - this.x;
        const dy = centerY - this.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);
        if (distToCenter > 0) {
            this.vx += (dx / distToCenter) * 0.02;
            this.vy += (dy / distToCenter) * 0.02;
        }
        
        // Mutual attraction (stronger with fewer particles)
        for (let other of particles) {
            if (other === this) continue;
            const odx = other.x - this.x;
            const ody = other.y - this.y;
            const distSq = odx * odx + ody * ody;
            if (distSq > 100 && distSq < 50000) {
                const force = 50 / distSq;
                this.vx += odx * force;
                this.vy += ody * force;
            }
        }
    }
    
    applyChaos(time) {
        // Erratic, unpredictable movement
        const t = time * 0.001;
        const chaosStrength = 0.5;
        
        this.vx += (Math.random() - 0.5) * chaosStrength;
        this.vy += (Math.random() - 0.5) * chaosStrength;
        
        // Occasional "jumps"
        if (Math.random() < 0.01) {
            this.vx += (Math.random() - 0.5) * 10;
            this.vy += (Math.random() - 0.5) * 10;
        }
        
        // Noise-driven drift
        this.vx += noise.noise(this.x * 0.01, t) * 0.2;
        this.vy += noise.noise(this.y * 0.01, t + 100) * 0.2;
    }
    
    applyNoiseDrift(time) {
        const t = time * 0.0003;
        const scale = 0.005;
        this.vx += noise.noise(this.x * scale, this.y * scale + t) * 0.05;
        this.vy += noise.noise(this.x * scale + 100, this.y * scale + t) * 0.05;
    }
    
    applyMouseForce() {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distSq = dx * dx + dy * dy;
        const radius = 250;
        
        if (distSq < radius * radius && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / radius) * config.attractionStrength * 0.01;
            
            if (mouse.down) {
                // Repel when mouse down
                this.vx -= (dx / dist) * force * 2;
                this.vy -= (dy / dist) * force * 2;
            } else {
                // Attract normally
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }
    }
    
    applyShockwaves() {
        for (let wave of shockwaves) {
            const dx = this.x - wave.x;
            const dy = this.y - wave.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (Math.abs(dist - wave.radius) < 30) {
                const force = wave.strength * (1 - wave.age / wave.maxAge);
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }
    }
    
    draw() {
        // Glow effect
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 3
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.4, this.color + '60');
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Shockwave effect
class Shockwave {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 400;
        this.strength = 2;
        this.age = 0;
        this.maxAge = 60;
    }
    
    update() {
        this.radius += 8;
        this.age++;
        return this.age < this.maxAge && this.radius < this.maxRadius;
    }
    
    draw() {
        const opacity = 1 - this.age / this.maxAge;
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// Spatial hash for efficient neighbor queries
class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    
    clear() {
        this.cells.clear();
    }
    
    getKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }
    
    insert(particle) {
        const key = this.getKey(particle.x, particle.y);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(particle);
    }
    
    query(x, y, radius) {
        const results = [];
        const r = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        
        for (let i = -r; i <= r; i++) {
            for (let j = -r; j <= r; j++) {
                const key = `${cx + i},${cy + j}`;
                if (this.cells.has(key)) {
                    results.push(...this.cells.get(key));
                }
            }
        }
        return results;
    }
}

const spatialHash = new SpatialHash(100);

// Initialize particles
function initParticles() {
    particles = [];
    for (let i = 0; i < config.particleCount; i++) {
        particles.push(new Particle());
    }
}

// Draw connections between nearby particles
function drawConnections() {
    const maxConnections = 3;
    
    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        let connections = 0;
        
        // Use spatial hash for efficiency
        const neighbors = spatialHash.query(p1.x, p1.y, config.connectionRadius);
        
        for (let p2 of neighbors) {
            if (p2 === p1 || p2.id < p1.id) continue;
            if (connections >= maxConnections) break;
            
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < config.connectionRadius * config.connectionRadius) {
                const dist = Math.sqrt(distSq);
                const opacity = (1 - dist / config.connectionRadius) * 0.4;
                
                // Gradient line
                const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                gradient.addColorStop(0, p1.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
                gradient.addColorStop(1, p2.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
                
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 1 + (1 - dist / config.connectionRadius);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                
                connections++;
            }
        }
    }
}

// Main animation loop
function animate(time) {
    // FPS calculation
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        document.getElementById('fps').textContent = `FPS: ${fps}`;
    }
    
    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(5, 5, 8, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update spatial hash
    spatialHash.clear();
    for (let p of particles) {
        spatialHash.insert(p);
    }
    
    // Update and draw connections first (behind particles)
    drawConnections();
    
    // Update and draw particles
    for (let p of particles) {
        p.update(particles, time);
        p.draw();
    }
    
    // Update and draw shockwaves
    shockwaves = shockwaves.filter(w => {
        const alive = w.update();
        if (alive) w.draw();
        return alive;
    });
    
    // Update stats
    let connectionCount = 0;
    for (let p of particles) {
        const neighbors = spatialHash.query(p.x, p.y, config.connectionRadius);
        connectionCount += neighbors.filter(n => n !== p).length;
    }
    document.getElementById('particles').textContent = `Particles: ${particles.length}`;
    document.getElementById('connections').textContent = `Connections: ${Math.floor(connectionCount / 2)}`;
    
    requestAnimationFrame(animate);
}

// Event listeners
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', () => {
    mouse.down = true;
    shockwaves.push(new Shockwave(mouse.x, mouse.y));
});

window.addEventListener('mouseup', () => {
    mouse.down = false;
});

window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();
        const modes = ['emergent', 'neural', 'gravity', 'chaos'];
        const currentIndex = modes.indexOf(config.mode);
        config.mode = modes[(currentIndex + 1) % modes.length];
        document.getElementById('mode').textContent = `Mode: ${config.mode.charAt(0).toUpperCase() + config.mode.slice(1)}`;
        
        // Show mode indicator
        const indicator = document.getElementById('modeIndicator');
        const emojis = { emergent: '🌌', neural: '🧠', gravity: '🌟', chaos: '⚡' };
        indicator.textContent = emojis[config.mode];
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 800);
        
        // Update particle colors
        const palette = palettes[config.mode];
        for (let p of particles) {
            p.color = palette[Math.floor(Math.random() * palette.length)];
        }
    }
});

// UI controls
document.getElementById('particleCount').addEventListener('input', e => {
    const newCount = parseInt(e.target.value);
    if (newCount > particles.length) {
        for (let i = particles.length; i < newCount; i++) {
            particles.push(new Particle());
        }
    } else {
        particles.splice(newCount);
    }
    config.particleCount = newCount;
});

document.getElementById('connectionRadius').addEventListener('input', e => {
    config.connectionRadius = parseInt(e.target.value);
});

document.getElementById('attraction').addEventListener('input', e => {
    config.attractionStrength = parseInt(e.target.value) / 100;
});

// Touch support for mobile
window.addEventListener('touchmove', e => {
    e.preventDefault();
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
}, { passive: false });

window.addEventListener('touchstart', e => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    mouse.down = true;
    shockwaves.push(new Shockwave(mouse.x, mouse.y));
});

window.addEventListener('touchend', () => {
    mouse.down = false;
});

// Initialize and start
initParticles();
requestAnimationFrame(animate);
