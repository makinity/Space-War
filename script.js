(() => {
  const WIDTH = 600;
  const HEIGHT = 700;
  const STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER'
  };

  const PLAYER_SIZE = 50;
  const ENEMY_SIZE = 50; // slightly larger enemy sprite
  const PLAYER_Y_OFFSET = 40; // lift player so the sprite is fully visible above the bottom

  const COLORS = {
    black: '#000000',
    white: '#f0f0f0',
    green: '#32c85a',
    blue: '#4690ff',
    red: '#dc4646',
    yellow: '#f0dc3c',
    grey: '#5a5a5a'
  };

  const canvas = document.getElementById('gameCanvas') || createCanvas();
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  const images = {
    background: { image: null, loaded: false },
    player: { image: null, loaded: false },
    enemy: { image: null, loaded: false }
  };

  const sounds = {
    shoot: null,
    explosion: null
  };

  const keyState = {};

  let players = [];
  let enemies = [];
  let playerBullets = [];
  let enemyBullets = [];
  let score = 0;
  let highscore = loadHighscore();
  let spawnTimer = 0;
  let startTime = 0;
  let lastFrameTime = performance.now();
  let state = STATE.MENU;
  let lastMode = 1;
  let gameOverLogged = false;

  class Bullet {
    constructor(x, y, speed, color) {
      this.rect = { x, y, width: 6, height: 12 };
      this.speed = speed;
      this.color = color;
    }

    update() {
      this.rect.y += this.speed;
    }

    offScreen() {
      return this.rect.y + this.rect.height < 0 || this.rect.y > HEIGHT;
    }

    draw(surface) {
      surface.fillStyle = this.color;
      surface.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    }
  }

  class Player {
    constructor(centerX, color, controls, imageAsset) {
      this.image = imageAsset?.image || null;
      const size = { w: PLAYER_SIZE, h: PLAYER_SIZE };
      this.rect = {
        x: centerX - size.w / 2,
        y: HEIGHT - size.h - PLAYER_Y_OFFSET,
        width: size.w,
        height: size.h
      };
      this.color = color;
      this.controls = controls;
      this.speed = 6;
      this.maxHealth = 100;
      this.health = this.maxHealth;
      this.lives = 3;
      this.cooldownMs = 250;
      this.lastShot = 0;
    }

    isAlive() {
      return this.lives > 0;
    }

    handleInput(keys) {
      if (!this.isAlive()) {
        return;
      }
      let dx = 0;
      if (keys[this.controls.left]) {
        dx -= this.speed;
      }
      if (keys[this.controls.right]) {
        dx += this.speed;
      }
      this.rect.x = clamp(this.rect.x + dx, 10, WIDTH - this.rect.width - 10);
    }

    tryShoot(now, bullets, shootSound) {
      if (!this.isAlive()) {
        return false;
      }
      if (now - this.lastShot >= this.cooldownMs) {
        const bulletX = this.rect.x + this.rect.width / 2 - 3;
        const bulletY = this.rect.y - 12;
        bullets.push(new Bullet(bulletX, bulletY, -9, this.color));
        this.lastShot = now;
        playSound(shootSound);
        return true;
      }
      return false;
    }

    takeDamage(amount) {
      if (!this.isAlive()) {
        return;
      }
      this.health -= amount;
      if (this.health <= 0) {
        this.lives -= 1;
        if (this.lives > 0) {
          this.health = this.maxHealth;
          this.rect.y = HEIGHT - 70;
          this.rect.x = clamp(this.rect.x, 10, WIDTH - this.rect.width - 10);
        } else {
          this.health = 0;
        }
      }
    }

    draw(surface) {
      if (!this.isAlive()) {
        return;
      }
      if (this.image) {
        surface.drawImage(this.image, this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      } else {
        const points = [
          { x: this.rect.x + this.rect.width / 2, y: this.rect.y },
          { x: this.rect.x, y: this.rect.y + this.rect.height },
          { x: this.rect.x + this.rect.width, y: this.rect.y + this.rect.height }
        ];
        surface.fillStyle = this.color;
        surface.beginPath();
        surface.moveTo(points[0].x, points[0].y);
        surface.lineTo(points[1].x, points[1].y);
        surface.lineTo(points[2].x, points[2].y);
        surface.closePath();
        surface.fill();
      }
    }
  }

  class Enemy {
    constructor(x, speed, now, imageAsset) {
      this.image = imageAsset?.image || null;
      const size = { w: ENEMY_SIZE, h: ENEMY_SIZE };
      this.rect = {
        x,
        y: -size.h,
        width: size.w,
        height: size.h
      };
      this.speed = speed;
      this.color = COLORS.red;
      this.nextShot = now + randomInt(700, 1400);
    }

    update() {
      this.rect.y += this.speed;
    }

    readyToShoot(now) {
      return now >= this.nextShot;
    }

    scheduleNextShot(now) {
      this.nextShot = now + randomInt(900, 1600);
    }

    draw(surface) {
      if (this.image) {
        surface.drawImage(this.image, this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      } else {
        surface.fillStyle = this.color;
        surface.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      }
    }
  }

  function createCanvas() {
    const el = document.createElement('canvas');
    el.id = 'gameCanvas';
    el.width = WIDTH;
    el.height = HEIGHT;
    document.body.appendChild(el);
    return el;
  }

  function loadHighscore() {
    try {
      const value = localStorage.getItem('space-war-highscore');
      const parsed = parseInt(value || '', 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    } catch (err) {
      return 0;
    }
  }

  function saveHighscore(value) {
    try {
      localStorage.setItem('space-war-highscore', String(value));
    } catch (err) {
      // ignore storage errors
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function loadImage(source) {
    const sources = Array.isArray(source) ? source : [source];
    let index = 0;

    return new Promise((resolve) => {
      const img = new Image();

      const tryLoad = () => {
        img.src = sources[index];
      };

      img.onload = () => resolve({ image: img, loaded: true });
      img.onerror = () => {
        index += 1;
        if (index < sources.length) {
          tryLoad();
        } else {
          resolve({ image: null, loaded: false });
        }
      };

      tryLoad();
    });
  }

  function loadSound(path) {
    try {
      const audio = new Audio(path);
      audio.preload = 'auto';
      return audio;
    } catch (err) {
      return null;
    }
  }

  function playSound(sample) {
    if (!sample) {
      return;
    }
    try {
      const instance = sample.cloneNode();
      instance.volume = sample.volume;
      instance.play().catch(() => {});
    } catch (err) {
      // ignore audio errors
    }
  }

  function loadAssets() {
    const backgroundPromise = loadImage(['assets/background.png', 'assets/background.jpg']).then(
      (result) => {
        images.background = result;
      }
    );
    const playerPromise = loadImage('assets/player.png').then((result) => {
      images.player = result;
    });
    const enemyPromise = loadImage('assets/enemy.png').then((result) => {
      images.enemy = result;
    });

    sounds.shoot = loadSound('assets/shoot.wav');
    sounds.explosion = loadSound('assets/explosion.wav');

    return Promise.all([backgroundPromise, playerPromise, enemyPromise]);
  }

  function startGame(mode) {
    players = [];
    const p1Controls = { left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Space' };
    players.push(new Player(WIDTH / 2 - 70, COLORS.green, p1Controls, images.player));
    if (mode === 2) {
      const p2Controls = { left: 'KeyA', right: 'KeyD', shoot: 'KeyW' };
      players.push(new Player(WIDTH / 2 + 70, COLORS.blue, p2Controls, images.player));
    }

    enemies = [];
    playerBullets = [];
    enemyBullets = [];
    score = 0;
    spawnTimer = 0;
    startTime = performance.now();
    state = STATE.PLAYING;
    lastMode = mode;
    gameOverLogged = false;
  }

  function triggerGameOver() {
    if (!gameOverLogged) {
      if (score > highscore) {
        highscore = score;
        saveHighscore(highscore);
      }
      gameOverLogged = true;
    }
    state = STATE.GAME_OVER;
  }

  function handleMovement() {
    for (const player of players) {
      player.handleInput(keyState);
    }
  }

  function spawnEnemy(now, elapsed) {
    const xPos = randomInt(10, Math.max(10, WIDTH - ENEMY_SIZE - 10));
    const speed = Math.min(6.5, 2.5 + elapsed * 0.05);
    enemies.push(new Enemy(xPos, speed, now, images.enemy));
  }

  function updateEnemies(now, elapsed) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.update();

      if (enemy.readyToShoot(now)) {
        const bulletX = enemy.rect.x + enemy.rect.width / 2 - 3;
        const bulletY = enemy.rect.y + enemy.rect.height;
        const bulletSpeed = 6 + elapsed * 0.02;
        enemyBullets.push(new Bullet(bulletX, bulletY, bulletSpeed, COLORS.yellow));
        enemy.scheduleNextShot(now);
      }

      if (enemy.rect.y > HEIGHT) {
        enemies.splice(i, 1);
      }
    }
  }

  function updatePlayerBullets() {
    for (let i = playerBullets.length - 1; i >= 0; i -= 1) {
      const bullet = playerBullets[i];
      bullet.update();

      let hitEnemy = false;
      for (let j = enemies.length - 1; j >= 0; j -= 1) {
        if (rectsOverlap(bullet.rect, enemies[j].rect)) {
          enemies.splice(j, 1);
          score += 10;
          playSound(sounds.explosion);
          hitEnemy = true;
          break;
        }
      }

      if (hitEnemy || bullet.offScreen()) {
        playerBullets.splice(i, 1);
      }
    }
  }

  function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = enemyBullets[i];
      bullet.update();

      let hitPlayer = false;
      for (const player of players) {
        if (player.isAlive() && rectsOverlap(bullet.rect, player.rect)) {
          player.takeDamage(25);
          hitPlayer = true;
          break;
        }
      }

      if (hitPlayer || bullet.offScreen()) {
        enemyBullets.splice(i, 1);
      }
    }
  }

  function handleEnemyPlayerCollisions() {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      let collided = false;
      for (const player of players) {
        if (player.isAlive() && rectsOverlap(enemy.rect, player.rect)) {
          player.takeDamage(100);
          collided = true;
          break;
        }
      }
      if (collided) {
        enemies.splice(i, 1);
      }
    }
  }

  function updateGame(now, dt) {
    if (state !== STATE.PLAYING) {
      return;
    }

    handleMovement();

    const elapsed = (now - startTime) / 1000;
    const spawnInterval = Math.max(0.45, 1.1 - elapsed * 0.02);
    spawnTimer += dt;
    while (spawnTimer >= spawnInterval) {
      spawnTimer -= spawnInterval;
      spawnEnemy(now, elapsed);
    }

    updateEnemies(now, elapsed);
    updatePlayerBullets();
    updateEnemyBullets();
    handleEnemyPlayerCollisions();

    if (players.every((player) => !player.isAlive())) {
      triggerGameOver();
    }
  }

  function drawBackground() {
    if (images.background.loaded && images.background.image) {
      ctx.drawImage(images.background.image, 0, 0, WIDTH, HEIGHT);
    } else {
      ctx.fillStyle = COLORS.black;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function drawMenu() {
    ctx.fillStyle = COLORS.white;
    ctx.font = '48px Arial';
    const title = 'Space War';
    const titleWidth = ctx.measureText(title).width;
    ctx.fillText(title, WIDTH / 2 - titleWidth / 2, 180);

    ctx.font = '28px Arial';
    const prompt1 = 'Press 1 for Single Player';
    const prompt2 = 'Press 2 for Two Players';
    ctx.fillStyle = COLORS.green;
    ctx.fillText(prompt1, WIDTH / 2 - ctx.measureText(prompt1).width / 2, 280);
    ctx.fillStyle = COLORS.blue;
    ctx.fillText(prompt2, WIDTH / 2 - ctx.measureText(prompt2).width / 2, 330);

    ctx.font = '22px Arial';
    ctx.fillStyle = COLORS.yellow;
    const high = `High Score: ${highscore}`;
    ctx.fillText(high, WIDTH / 2 - ctx.measureText(high).width / 2, 390);

    ctx.fillStyle = COLORS.white;
    ctx.fillText('Esc to Quit (close tab)', WIDTH / 2 - 90, 450);
  }

  function drawHealthBar(x, y, width, height, health, maxHealth, color) {
    ctx.fillStyle = COLORS.grey;
    ctx.fillRect(x, y, width, height);
    const ratio = maxHealth ? Math.max(0, health) / maxHealth : 0;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * ratio, height);
  }

  function drawUI() {
    ctx.fillStyle = COLORS.white;
    ctx.font = '20px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${score}`, 15, 10);
    const highText = `High Score: ${highscore}`;
    ctx.fillText(highText, WIDTH - ctx.measureText(highText).width - 15, 10);

    players.forEach((player, idx) => {
      const yOffset = 40 + idx * 30;
      const label = `P${idx + 1} Lives: ${player.lives}`;
      const labelX = idx === 0 ? 15 : WIDTH - 200;
      ctx.fillStyle = player.color;
      ctx.fillText(label, labelX, yOffset);
      const barX = idx === 0 ? 120 : WIDTH - 190;
      drawHealthBar(barX, yOffset + 3, 140, 12, player.health, player.maxHealth, player.color);
    });
  }

  function drawGameOver() {
    ctx.font = '42px Arial';
    ctx.fillStyle = COLORS.yellow;
    const gameOverText = 'GAME OVER';
    ctx.fillText(gameOverText, WIDTH / 2 - ctx.measureText(gameOverText).width / 2, HEIGHT / 2 - 60);

    ctx.font = '28px Arial';
    ctx.fillStyle = COLORS.white;
    const restartText = 'Press R to Restart';
    ctx.fillText(restartText, WIDTH / 2 - ctx.measureText(restartText).width / 2, HEIGHT / 2);

    ctx.font = '20px Arial';
    const quitText = 'Esc to Quit (close tab)';
    ctx.fillText(quitText, WIDTH / 2 - ctx.measureText(quitText).width / 2, HEIGHT / 2 + 40);
  }

  function drawEntities() {
    for (const player of players) {
      player.draw(ctx);
    }
    for (const enemy of enemies) {
      enemy.draw(ctx);
    }
    for (const bullet of playerBullets) {
      bullet.draw(ctx);
    }
    for (const bullet of enemyBullets) {
      bullet.draw(ctx);
    }
  }

  function draw() {
    drawBackground();

    if (state === STATE.MENU) {
      drawMenu();
      return;
    }

    drawEntities();
    drawUI();

    if (state === STATE.GAME_OVER) {
      drawGameOver();
    }
  }

  function handleKeyDown(event) {
    keyState[event.code] = true;

    if (event.code === 'Space') {
      event.preventDefault();
    }

    if (state === STATE.MENU) {
      if (event.code === 'Digit1' || event.code === 'Numpad1') {
        startGame(1);
      } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
        startGame(2);
      }
      return;
    }

    if (state === STATE.PLAYING) {
      const now = performance.now();
      for (const player of players) {
        if (event.code === player.controls.shoot) {
          player.tryShoot(now, playerBullets, sounds.shoot);
        }
      }
      if (event.code === 'KeyR') {
        startGame(lastMode);
      }
    } else if (state === STATE.GAME_OVER) {
      if (event.code === 'KeyR') {
        startGame(lastMode);
      }
    }
  }

  function handleKeyUp(event) {
    keyState[event.code] = false;
    if (event.code === 'Space') {
      event.preventDefault();
    }
  }

  function gameLoop(timestamp) {
    const dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;
    updateGame(timestamp, dt);
    draw();
    requestAnimationFrame(gameLoop);
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  loadAssets().then(() => {
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
})();
