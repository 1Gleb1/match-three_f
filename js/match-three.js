import { Game } from './game.js';
import { Grid } from './grid.js';

export class MatchThree {
	wrap = document.querySelector('.wrap');
	hud = {
		playerBar: document.querySelector('.health-bar.player'),
		enemyBar: document.querySelector('.health-bar.enemy'),
		score: document.querySelector('.score'),
	};
	playerMaxHealth = 100;
	enemyMaxHealth = 100;
	playerHealth = this.playerMaxHealth;
	enemyHealth = this.enemyMaxHealth;
	enemyAttackIntervalMs = 5000;
	enemyDamagePerTick = 10;
	isGameOver = false;
	enemyTimerId = null;

	constructor(rowsCount, columnsCount, tilesCount) {
		this.game = new Game(rowsCount, columnsCount, tilesCount);
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
		if (damage > 0) this.damageEnemy(damage);
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
		this.updateHealthBar(this.hud.playerBar, this.playerHealth, this.playerMaxHealth);
		this.updateHealthBar(this.hud.enemyBar, this.enemyHealth, this.enemyMaxHealth);
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
			this.damagePlayer(this.enemyDamagePerTick);
		}, this.enemyAttackIntervalMs);
	}

	damagePlayer(amount) {
		if (this.isGameOver) return;
		this.playerHealth = Math.max(0, this.playerHealth - amount);
		this.updateHealthBar(this.hud.playerBar, this.playerHealth, this.playerMaxHealth);
		if (this.playerHealth <= 0) this.endGame(false);
	}

	damageEnemy(amount) {
		if (this.isGameOver) return;
		this.enemyHealth = Math.max(0, this.enemyHealth - amount);
		this.updateHealthBar(this.hud.enemyBar, this.enemyHealth, this.enemyMaxHealth);
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
