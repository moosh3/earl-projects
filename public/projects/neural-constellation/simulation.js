/**
 * Neural Constellation - Advanced Particle Simulation
 * Features: Emergent flocking, neural connections, mouse interaction, multiple modes
 */

(function() {
    'use strict';

    // Canvas setup
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // UI elements
    const fpsEl = document.getElementById('fps');
    const particlesEl = document.getElementById('particles');
    const connectionsEl = document.getElementById('connections');
    const modeEl = document.getElementById('mode');
    const modeIndicator = document.getElementById('modeIndicator');
    const particleCountSlider = document.getElementById('particleCount');
    const connectionRadiusSlider = document.getElementById('connectionRadius');
    const attractionSlider = document.getElementById('attraction');

    // Configuration
    const config = {
        particleCount: 150,
        connectionRadius: 120,
        attractionForce: 0.3,
        maxSpeed: 3,
        maxForce: 0.1,
        particleRadius: 2.5,
        glowIntensity: 20,
        trailFade: 0.08,
        mode: 0 // 0: Emergent, 1: Gravity, 2: Neural
    };

    // Mode names and emojis
    const modes = [
        { name: 'Emergent', emoji: '🌌', color: '#4ecdc4' },
        { name: 'Gravity', emoji: '🌍', color: '#ff6b35' },
        { name: 'Neural', emoji: '🧠', color: '#a855f7' }
    ];

    // State
    let particles = [];
    let mouse = { x: 0, y: 0, active: false };
    let shockwaves = [];
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    let width, height;
    let animationId;

    // Resize canvas
    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    // Utility functions
    const random = (min, max) => Math.random() * (max - min) + min;
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
    const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

    // Color palette for particles
    const colors = [
        '#ff6b35', // Orange
        '#4ecdc4', // Teal
        '#a855f7', // Purple
        '#fbbf24', // Amber
        '#f472b6', // Pink
        '#60a5fa'  // Blue
    ];

    // Shockwave class
    class Shockwave {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 0;
            this.maxRadius = 250;
            this.strength = 15;
            this.decay = 0.96;
            this.life = 1;
        }

        update() {
            this.radius += 8;
            this.strength *= this.decay;
            this.life -= 0.02;
            return this.life > 0 && this.radius < this.maxRadius;
        }

        draw(ctx) {
            const alpha = this.life * 0.5;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            
            // Outer ring
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(78, 205, 196, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Inner glow
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 107, 53, ${alpha * 0.7})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
        }

        affect(particle) {
            const d = dist(this.x, this.y, particle.x, particle.y);
            const range = 40;
            if (d < this.radius + range && d > this.radius - range) {
                const a = angle(this.x, this.y, particle.x, particle.y);
                const force = this.strength * (1 - Math.abs(d - this.radius) / range);
                particle.vx += Math.cos(a) * force;
                particle.vy += Math.sin(a) * force;
            }
        }
    }

    // Particle class
    class Particle {
        constructor(x, y) {
            this.x = x ?? random(0, width);
            this.y = y ?? random(0, height);
            this.vx = random(-2, 2);
            this.vy = random(-2, 2);
            this.radius = random(1.5, 4);
            this.baseRadius = this.radius;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.pulse = random(0, Math.PI * 2);
            this.pulseSpeed = random(0.02, 0.05);
            this.connections = 0;
            this.energy = random(0.5, 1);
        }

        update() {
            // Mode-specific behavior
            switch (config.mode) {
                case 0: this.emergentBehavior(); break;
                case 1: this.gravityBehavior(); break;
                case 2: this.neuralBehavior(); break;
            }

            // Mouse attraction
            if (mouse.active) {
                const d = dist(this.x, this.y, mouse.x, mouse.y);
                if (d < 300 && d > 20) {
                    const a = angle(this.x, this.y, mouse.x, mouse.y);
                    const force = config.attractionForce * (1 - d / 300);
                    this.vx += Math.cos(a) * force;
                    this.vy += Math.sin(a) * force;
                }
            }

            // Apply shockwaves
            shockwaves.forEach(sw => sw.affect(this));

            // Damping
            this.vx *= 0.995;
            this.vy *= 0.995;

            // Speed limit
            const speed = Math.sqrt(this.vx ** 2 + this.vy ** 2);
            if (speed > config.maxSpeed) {
                this.vx = (this.vx / speed) * config.maxSpeed;
                this.vy = (this.vy / speed) * config.maxSpeed;
            }

            // Update position
            this.x += this.vx;
            this.y += this.vy;

            // Boundary wrap
            if (this.x < -this.radius) this.x = width + this.radius;
            if (this.x > width + this.radius) this.x = -this.radius;
            if (this.y < -this.radius) this.y = height + this.radius;
            if (this.y > height + this.radius) this.y = -this.radius;

            // Pulse animation
            this.pulse += this.pulseSpeed;
            this.radius = this.baseRadius + Math.sin(this.pulse) * 0.5;
        }

        emergentBehavior() {
            // Boids-like flocking
            const neighbors = [];
            const perceptionRadius = 80;

            for (const other of particles) {
                if (other === this) continue;
                const d = dist(this.x, this.y, other.x, other.y);
                if (d < perceptionRadius) {
                    neighbors.push(other);
                }
            }

            if (neighbors.length > 0) {
                // Separation - avoid crowding
                let sepX = 0, sepY = 0;
                let alignmentX = 0, alignmentY = 0;
                let cohesionX = 0, cohesionY = 0;

                for (const n of neighbors) {
                    // Separation
                    const d = dist(this.x, this.y, n.x, n.y);
                    if (d < 30) {
                        sepX += (this.x - n.x) / d;
                        sepY += (this.y - n.y) / d;
                    }
                    // Alignment
                    alignmentX += n.vx;
                    alignmentY += n.vy;
                    // Cohesion
                    cohesionX += n.x;
                    cohesionY += n.y;
                }

                const count = neighbors.length;
                alignmentX /= count;
                alignmentY /= count;
                cohesionX = (cohesionX / count - this.x) * 0.01;
                cohesionY = (cohesionY / count - this.y) * 0.01;

                // Apply forces
                this.vx += sepX * 0.05 + alignmentX * 0.02 + cohesionX * 0.01;
                this.vy += sepY * 0.05 + alignmentY * 0.02 + cohesionY * 0.01;
            }

            // Random wandering
            this.vx += random(-0.1, 0.1);
            this.vy += random(-0.1, 0.1);
        }

        gravityBehavior() {
            // Mutual attraction between particles
            for (const other of particles) {
                if (other === this) continue;
                const d = dist(this.x, this.y, other.x, other.y);
                if (d < 150 && d > 5) {
                    const force = 0.5 / (d * 0.1);
                    const a = angle(this.x, this.y, other.x, other.y);
                    this.vx += Math.cos(a) * force;
                    this.vy += Math.sin(a) * force;
                }
            }

            // Center pull (weak)
            const cx = width / 2, cy = height / 2;
            const dc = dist(this.x, this.y, cx, cy);
            if (dc > 100) {
                const a = angle(this.x, this.y, cx, cy);
                this.vx += Math.cos(a) * 0.01;
                this.vy += Math.sin(a) * 0.01;
            }
        }

        neuralBehavior() {
            // Oscillating movement with phase
            const phase = this.x * 0.01 + this.y * 0.01;
            this.vx += Math.sin(Date.now() * 0.001 + phase) * 0.02;
            this.vy += Math.cos(Date.now() * 0.001 + phase) * 0.02;

            // Attraction to "neurons" (random cluster points)
            const time = Date.now() * 0.0002;
            const clusterX = width / 2 + Math.sin(time + this.color.charCodeAt(1)) * 200;
            const clusterY = height / 2 + Math.cos(time * 0.7 + this.color.charCodeAt(2)) * 150;
            
            const d = dist(this.x, this.y, clusterX, clusterY);
            if (d > 50) {
                const a = angle(this.x, this.y, clusterX, clusterY);
                this.vx += Math.cos(a) * 0.03;
                this.vy += Math.sin(a) * 0.03;
            }
        }

        draw(ctx) {
            // Glow effect
            const glowSize = this.radius * config.glowIntensity * this.energy;
            
            // Outer glow
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, glowSize
            );
            gradient.addColorStop(0, this.color + '80');
            gradient.addColorStop(0.5, this.color + '20');
            gradient.addColorStop(1, 'transparent');

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Colored ring
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }
    }

    // Initialize particles
    function initParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(new Particle());
        }
    }

    // Draw connections between particles
    function drawConnections() {
        let connectionCount = 0;
        const maxConnections = 3;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineWidth = 1;

        for (let i = 0; i < particles.length; i++) {
            const p1 = particles[i];
            p1.connections = 0;

            for (let j = i + 1; j < particles.length; j++) {
                if (p1.connections >= maxConnections) break;

                const p2 = particles[j];
                const d = dist(p1.x, p1.y, p2.x, p2.y);

                if (d < config.connectionRadius) {
                    const alpha = (1 - d / config.connectionRadius) * 0.5;
                    
                    // Gradient connection
                    const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    gradient.addColorStop(0, p1.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
                    gradient.addColorStop(1, p2.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));

                    ctx.strokeStyle = gradient;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();

                    p1.connections++;
                    connectionCount++;

                    // Neural mode: pulse data along connection
                    if (config.mode === 2) {
                        const pulsePos = (Date.now() * 0.002) % 1;
                        const px = p1.x + (p2.x - p1.x) * pulsePos;
                        const py = p1.y + (p2.y - p1.y) * pulsePos;
                        
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(px, py, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        ctx.restore();
        return connectionCount;
    }

    // Draw background gradient
    function drawBackground() {
        const gradient = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height)
        );
        gradient.addColorStop(0, '#0a0a15');
        gradient.addColorStop(1, '#050508');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    // Cycle through modes
    function cycleMode() {
        config.mode = (config.mode + 1) % modes.length;
        const mode = modes[config.mode];
        
        modeEl.textContent = `Mode: ${mode.name}`;
        modeIndicator.textContent = mode.emoji;
        modeIndicator.style.color = mode.color;
        modeIndicator.classList.add('show');
        
        setTimeout(() => modeIndicator.classList.remove('show'), 1500);

        // Reset velocities on mode change for dramatic effect
        particles.forEach(p => {
            p.vx *= 0.5;
            p.vy *= 0.5;
        });
    }

    // Main animation loop
    function animate() {
        // Calculate FPS
        const now = performance.now();
        frameCount++;
        if (now - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = now;
            fpsEl.textContent = `FPS: ${fps}`;
        }

        // Clear with fade effect
        ctx.fillStyle = `rgba(5, 5, 8, ${config.trailFade})`;
        ctx.fillRect(0, 0, width, height);

        // Draw background
        drawBackground();

        // Update and draw shockwaves
        shockwaves = shockwaves.filter(sw => {
            const alive = sw.update();
            if (alive) sw.draw(ctx);
            return alive;
        });

        // Update particles
        particles.forEach(p => p.update());

        // Draw connections
        const connectionCount = drawConnections();

        // Draw particles
        particles.forEach(p => p.draw(ctx));

        // Update stats
        particlesEl.textContent = `Particles: ${particles.length}`;
        connectionsEl.textContent = `Connections: ${connectionCount}`;

        animationId = requestAnimationFrame(animate);
    }

    // Event handlers
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
    });

    canvas.addEventListener('mouseleave', () => {
        mouse.active = false;
    });

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        shockwaves.push(new Shockwave(
            e.clientX - rect.left,
            e.clientY - rect.top
        ));
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            cycleMode();
        }
    });

    // Control handlers
    particleCountSlider.addEventListener('input', (e) => {
        const count = parseInt(e.target.value);
        const diff = count - particles.length;
        
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                particles.push(new Particle());
            }
        } else {
            particles.splice(0, -diff);
        }
        config.particleCount = count;
    });

    connectionRadiusSlider.addEventListener('input', (e) => {
        config.connectionRadius = parseInt(e.target.value);
    });

    attractionSlider.addEventListener('input', (e) => {
        config.attractionForce = parseInt(e.target.value) / 100;
    });

    // Touch support for mobile
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        mouse.x = touch.clientX - rect.left;
        mouse.y = touch.clientY - rect.top;
        mouse.active = true;
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        mouse.active = false;
    });

    canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        shockwaves.push(new Shockwave(
            touch.clientX - rect.left,
            touch.clientY - rect.top
        ));
    }, { passive: false });

    // Initialize
    resize();
    initParticles();
    animate();

    // Expose to global for debugging
    window.neuralConstellation = { config, particles, shockwaves, cycleMode };
})();