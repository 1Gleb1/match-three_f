import { Game } from './game.js';
import { Grid } from './grid.js';

export class MatchThree {
	wrap = document.querySelector('.wrap');
	hud = {
		playerBar: document.querySelector('.health-bar.player'),
		enemyBar: document.querySelector('.health-bar.enemy'),
		score: document.querySelector('.score'),
		enemyStatus: document.querySelector('.enemy-state .status'),
		enemyTimer: document.querySelector('.enemy-state .timer'),
	};
	playerMaxHealth = 1000;
	enemyMaxHealth = 1000;
	playerHealth = this.playerMaxHealth;
	enemyHealth = this.enemyMaxHealth;
	enemyAttackIntervalMs = 5000;
	enemyDamagePerTick = 10;
	enemyNextAttackAt = 0;
	isGameOver = false;
	enemyTimerId = null;
	enemyTickerId = null;

	constructor(rowsCount, columnsCount, tilesCount) {
		this.lifestealEnabled = false;
		this.enemyAttackIntervalMsBase = this.enemyAttackIntervalMs;
		this.enemyStunUntil = 0;
		this.game = new Game(rowsCount, columnsCount, tilesCount, {
			onEnemyDamage: amount => this.damageEnemy(amount),
			onPlayerHeal: amount => this.healPlayer(amount),
			onEnemySlow: (slowFactor, durationMs) =>
				this.applyEnemySlow(slowFactor, durationMs),
			onEnemyStun: durationMs => this.applyEnemyStun(durationMs),
			onEnableLifesteal: durationMs => this.enableLifesteal(durationMs),
		});
		this.grid = new Grid(this.wrap, this.game.matrix);
		this.wrap.addEventListener('swap', event => {
			const firstElementPosition = event.detail.firstElementPosition;
			const secondElementPosition = event.detail.secondElementPosition;
			this.swap(firstElementPosition, secondElementPosition);
		});

		this.renderHealth();
		this.startEnemyAttacks();
	}

	async swap(firstElementPosition, secondElementPosition) {
		const swapStates = this.game.swap(
			firstElementPosition,
			secondElementPosition
		);
		await this.grid.swap(
			firstElementPosition,
			secondElementPosition,
			swapStates
		);
		const damage = this.calculateDamageFromSwapStates(swapStates);
		if (damage > 0) {
			if (this.lifestealEnabled) this.healPlayer(Math.floor(damage * 0.5));
			this.damageEnemy(damage);
		}
		this.updateScore();
	}

	updateScore() {
		this.hud.score.innerHTML = this.game.score;
	}

	calculateDamageFromSwapStates(swapStates) {
		if (!swapStates) return 0;
		// Count how many tiles were removed across all states. Each state pair: [afterRemove, afterFill]
		let removed = 0;
		for (let i = 0; i < swapStates.length; i += 2) {
			const gridAfterRemove = swapStates[i];
			for (let row = 0; row < gridAfterRemove.length; row++) {
				for (let col = 0; col < gridAfterRemove[0].length; col++) {
					if (gridAfterRemove[row][col] === null) removed++;
				}
			}
		}
		// Example mapping: every 3 removed tiles = 5 damage; scale linearly
		if (removed === 0) return 0;
		return Math.floor((removed / 3) * 5);
	}

	renderHealth() {
		this.updateHealthBar(
			this.hud.playerBar,
			this.playerHealth,
			this.playerMaxHealth
		);
		this.updateHealthBar(
			this.hud.enemyBar,
			this.enemyHealth,
			this.enemyMaxHealth
		);
	}

	updateHealthBar(barEl, current, max) {
		if (!barEl) return;
		const fill = barEl.querySelector('.health-fill');
		const text = barEl.querySelector('.health-text');
		const pct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
		if (fill) fill.style.width = pct + '%';
		if (text) text.textContent = `${current} / ${max}`;
	}

	startEnemyAttacks() {
		if (this.enemyTimerId) clearInterval(this.enemyTimerId);
		this.enemyTimerId = setInterval(() => {
			if (this.isGameOver) return;
			if (Date.now() < this.enemyStunUntil) return;
			this.damagePlayer(this.enemyDamagePerTick);
			this.setEnemyStatus('Preparing');
			this.enemyNextAttackAt = Date.now() + this.enemyAttackIntervalMs;
		}, this.enemyAttackIntervalMs);
		this.enemyNextAttackAt = Date.now() + this.enemyAttackIntervalMs;
		this.setEnemyStatus('Preparing');
		this.startEnemyTicker();
	}

	applyEnemySlow(slowFactor, durationMs) {
		// slowFactor in (0..1], e.g., 0.5 means half as frequent
		const current = this.enemyAttackIntervalMs;
		this.enemyAttackIntervalMs = Math.floor(
			this.enemyAttackIntervalMsBase / slowFactor
		);
		this.startEnemyAttacks();
		setTimeout(() => {
			this.enemyAttackIntervalMs = current;
			this.startEnemyAttacks();
		}, durationMs);
	}

	startEnemyTicker() {
		if (this.enemyTickerId) clearInterval(this.enemyTickerId);
		this.enemyTickerId = setInterval(() => {
			if (this.isGameOver) return;
			if (!this.hud.enemyTimer) return;
			const now = Date.now();
			let msLeft = Math.max(0, this.enemyNextAttackAt - now);
			if (now < this.enemyStunUntil) this.setEnemyStatus('Stunned');
			else this.setEnemyStatus('Preparing');
			this.hud.enemyTimer.textContent = (msLeft / 1000).toFixed(1) + 's';
		}, 100);
	}

	setEnemyStatus(text) {
		if (this.hud.enemyStatus) this.hud.enemyStatus.textContent = text;
	}

	applyEnemyStun(durationMs) {
		this.enemyStunUntil = Date.now() + durationMs;
	}

	enableLifesteal(durationMs) {
		this.lifestealEnabled = true;
		setTimeout(() => (this.lifestealEnabled = false), durationMs);
	}

	healPlayer(amount) {
		if (this.isGameOver) return;
		this.playerHealth = Math.min(
			this.playerMaxHealth,
			this.playerHealth + amount
		);
		this.updateHealthBar(
			this.hud.playerBar,
			this.playerHealth,
			this.playerMaxHealth
		);
	}

	damagePlayer(amount) {
		if (this.isGameOver) return;
		this.playerHealth = Math.max(0, this.playerHealth - amount);
		this.updateHealthBar(
			this.hud.playerBar,
			this.playerHealth,
			this.playerMaxHealth
		);
		if (this.playerHealth <= 0) this.endGame(false);
	}

	damageEnemy(amount) {
		if (this.isGameOver) return;
		this.enemyHealth = Math.max(0, this.enemyHealth - amount);
		this.updateHealthBar(
			this.hud.enemyBar,
			this.enemyHealth,
			this.enemyMaxHealth
		);
		if (this.enemyHealth <= 0) this.endGame(true);
	}

	endGame(playerWon) {
		if (this.isGameOver) return;
		this.isGameOver = true;
		if (this.enemyTimerId) clearInterval(this.enemyTimerId);
		// Block input
		if (this.grid) this.grid.isGameBlocked = true;
		// Show end state
		const endDiv = document.createElement('div');
		endDiv.className = 'end-state';
		endDiv.textContent = playerWon ? 'You Win!' : 'You Lose!';
		this.wrap.append(endDiv);
	}
}
