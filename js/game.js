import { deepClone } from './utils.js';

export class Game {
	constructor(rowsCount, columnsCount, elementsCount, effects = {}) {
		this.rowsCount = rowsCount;
		this.columnsCount = columnsCount;
		this.elementsCount = elementsCount;
		this.effects = {
			onEnemyDamage: effects.onEnemyDamage || (() => {}),
			onPlayerHeal: effects.onPlayerHeal || (() => {}),
			onEnemySlow: effects.onEnemySlow || (() => {}),
			onEnemyStun: effects.onEnemyStun || (() => {}),
			onEnableLifesteal: effects.onEnableLifesteal || (() => {}),
		};
		this.lastSwapA = null;
		this.lastSwapB = null;
		this.lockedThisDrop = new Set();
		this.specialUid = 1;
		this.init();
	}

	init() {
		this.score = 0;
		this.matrix = Array(this.rowsCount)
			.fill()
			.map(() => new Array(this.columnsCount).fill(null));

		for (let row = 0; row < this.rowsCount; row++) {
			for (let column = 0; column < this.columnsCount; column++) {
				do {
					this.matrix[row][column] = this.getRandomValue();
				} while (this.isRow(row, column));
			}
		}
	}

	getRandomValue() {
		return Math.floor(Math.random() * this.elementsCount) + 1;
	}

	getBaseValue(value) {
		const abs = Math.abs(value);
		return abs > 100 ? abs % 100 : abs;
	}

	isSameBase(a, b) {
		return this.getBaseValue(a) === this.getBaseValue(b);
	}

	isRow(row, column) {
		return this.isVerticalRow(row, column) || this.isHorizontalRow(row, column);
	}

	isVerticalRow(row, column) {
		const absValue = this.getBaseValue(this.matrix[row][column]);
		let elementsInRow = 1;

		let currentRow = row - 1;
		while (
			currentRow >= 0 &&
			this.getBaseValue(this.matrix[currentRow][column]) === absValue
		) {
			elementsInRow++;
			currentRow--;
		}

		currentRow = row + 1;
		while (
			currentRow <= this.rowsCount - 1 &&
			this.getBaseValue(this.matrix[currentRow][column]) === absValue
		) {
			elementsInRow++;
			currentRow++;
		}

		return elementsInRow >= 3;
	}

	isHorizontalRow(row, column) {
		const absValue = this.getBaseValue(this.matrix[row][column]);
		let elementsInRow = 1;

		let currentColumn = column - 1;
		while (
			currentColumn >= 0 &&
			this.getBaseValue(this.matrix[row][currentColumn]) === absValue
		) {
			elementsInRow++;
			currentColumn--;
		}

		currentColumn = column + 1;
		while (
			currentColumn <= this.columnsCount - 1 &&
			this.getBaseValue(this.matrix[row][currentColumn]) === absValue
		) {
			elementsInRow++;
			currentColumn++;
		}

		return elementsInRow >= 3;
	}

	swap(firstElement, secondElement) {
		this.lastSwapA = { ...firstElement };
		this.lastSwapB = { ...secondElement };
		this.swap2Elements(firstElement, secondElement);
		const isRowWithFisrtElement = this.isRow(
			firstElement.row,
			firstElement.column
		);
		const isRowWithSecondElement = this.isRow(
			secondElement.row,
			secondElement.column
		);
		if (!isRowWithFisrtElement && !isRowWithSecondElement) {
			this.swap2Elements(firstElement, secondElement);
			return null;
		}

		const swapStates = [];
		let removedElements = 0;
		do {
			removedElements = this.removeAllRows();

			if (removedElements > 0) {
				this.score += removedElements;
				swapStates.push(deepClone(this.matrix));
				this.dropElements();
				this.fillBlanks();
				swapStates.push(deepClone(this.matrix));
			}
		} while (removedElements > 0);

		return swapStates;
	}

	swap2Elements(firstElement, secondElement) {
		const temp = this.matrix[firstElement.row][firstElement.column];
		this.matrix[firstElement.row][firstElement.column] =
			this.matrix[secondElement.row][secondElement.column];
		this.matrix[secondElement.row][secondElement.column] = temp;
	}

	removeAllRows() {
		const matches = this.findAllMatches();
		if (matches.length === 0) return 0;

		const toRemove = new Set();
		const specialsToPlace = [];
		const triggeredSpecials = [];

		for (const match of matches) {
			const length = match.cells.length;
			const base = this.getBaseValue(
				this.matrix[match.cells[0].row][match.cells[0].column]
			);

			const specialCell = match.cells.find(
				c => Math.abs(this.matrix[c.row][c.column]) > 100
			);
			if (specialCell)
				triggeredSpecials.push({
					base,
					row: specialCell.row,
					column: specialCell.column,
				});

			if (length >= 4) {
				const specialPos = this.chooseSpecialPosition(match.cells);
				specialsToPlace.push({
					row: specialPos.row,
					column: specialPos.column,
					base,
				});
				for (const c of match.cells) {
					if (c.row === specialPos.row && c.column === specialPos.column)
						continue;
					toRemove.add(`${c.row}:${c.column}`);
				}
			} else {
				for (const c of match.cells) toRemove.add(`${c.row}:${c.column}`);
			}
		}

		for (const eff of triggeredSpecials)
			this.applySpecialEffect(eff.base, eff.row, eff.column, toRemove);

		let removedCount = 0;
		for (const key of toRemove) {
			const [rStr, cStr] = key.split(':');
			const r = parseInt(rStr, 10);
			const c = parseInt(cStr, 10);
			if (this.matrix[r][c] !== null) {
				this.matrix[r][c] = null;
				removedCount++;
			}
		}

		// Place specials and lock their rows for the upcoming drop
		this.lockedThisDrop.clear();
		for (const sp of specialsToPlace) {
			// Unique encoding per special to keep identity stable across cascades
			const specialVal = 100 * (this.specialUid + 1) + (sp.base % 100);
			this.specialUid++;
			this.matrix[sp.row][sp.column] = specialVal;
			// Lock only if no empty cells exist below; otherwise let it fall
			let hasEmptyBelow = false;
			for (let r = sp.row + 1; r < this.rowsCount; r++) {
				if (this.matrix[r][sp.column] === null) { hasEmptyBelow = true; break; }
			}
			if (!hasEmptyBelow) this.lockedThisDrop.add(`${sp.row}:${sp.column}`);
		}

		return removedCount;
	}

	findAllMatches() {
		const matches = [];

		// Horizontal runs
		for (let r = 0; r < this.rowsCount; r++) {
			let c = 0;
			while (c < this.columnsCount) {
				const start = c;
				const base = this.getBaseValue(this.matrix[r][c]);
				let end = c + 1;
				while (
					end < this.columnsCount &&
					this.getBaseValue(this.matrix[r][end]) === base
				)
					end++;
				const len = end - start;
				if (len >= 3) {
					const cells = [];
					for (let cc = start; cc < end; cc++)
						cells.push({ row: r, column: cc });
					matches.push({ orientation: 'H', cells });
				}
				c = end;
			}
		}

		// Vertical runs
		for (let c = 0; c < this.columnsCount; c++) {
			let r = 0;
			while (r < this.rowsCount) {
				const start = r;
				const base = this.getBaseValue(this.matrix[r][c]);
				let end = r + 1;
				while (
					end < this.rowsCount &&
					this.getBaseValue(this.matrix[end][c]) === base
				)
					end++;
				const len = end - start;
				if (len >= 3) {
					const cells = [];
					for (let rr = start; rr < end; rr++)
						cells.push({ row: rr, column: c });
					matches.push({ orientation: 'V', cells });
				}
				r = end;
			}
		}

		return matches;
	}

	chooseSpecialPosition(cells) {
		if (this.lastSwapA) {
			const foundA = cells.find(
				c => c.row === this.lastSwapA.row && c.column === this.lastSwapA.column
			);
			if (foundA) return foundA;
		}
		if (this.lastSwapB) {
			const foundB = cells.find(
				c => c.row === this.lastSwapB.row && c.column === this.lastSwapB.column
			);
			if (foundB) return foundB;
		}
		return cells[Math.floor(cells.length / 2)];
	}

	applySpecialEffect(base, row, column, toRemoveSet) {
		switch (base) {
			case 1: // Dragon Slave
				for (let c = 0; c < this.columnsCount; c++)
					toRemoveSet.add(`${row}:${c}`);
				this.effects.onEnemyDamage(15);
				break;
			case 2: // Insatiable Hunger
				this.effects.onEnableLifesteal(6000);
				break;
			case 3: // Crystal Nova
				this.addNeighborsToRemove(row, column, toRemoveSet);
				this.effects.onEnemyDamage(10);
				this.effects.onEnemySlow(0.5, 6000);
				break;
			case 4: // Frost Blast
				this.addNeighborsToRemove(row, column, toRemoveSet);
				this.effects.onEnemyDamage(8);
				this.effects.onEnemySlow(0.5, 9000);
				break;
			case 5: // Magic Missile
				this.effects.onEnemyDamage(20);
				this.effects.onEnemyStun(3000);
				break;
			case 6: // Splinter Blast
				this.effects.onEnemyDamage(12);
				this.removeRandomTiles(5, toRemoveSet);
				break;
			default:
				for (let c = 0; c < this.columnsCount; c++)
					toRemoveSet.add(`${row}:${c}`);
				for (let r = 0; r < this.rowsCount; r++)
					toRemoveSet.add(`${r}:${column}`);
				this.effects.onEnemyDamage(10);
		}
	}

	addNeighborsToRemove(row, column, toRemoveSet) {
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				if (dr === 0 && dc === 0) continue;
				const rr = row + dr;
				const cc = column + dc;
				if (
					rr >= 0 &&
					rr < this.rowsCount &&
					cc >= 0 &&
					cc < this.columnsCount
				) {
					toRemoveSet.add(`${rr}:${cc}`);
				}
			}
		}
	}

	removeRandomTiles(count, toRemoveSet) {
		const candidates = [];
		for (let r = 0; r < this.rowsCount; r++) {
			for (let c = 0; c < this.columnsCount; c++) {
				if (this.matrix[r][c] !== null) candidates.push({ r, c });
			}
		}
		for (let i = 0; i < count && candidates.length > 0; i++) {
			const idx = Math.floor(Math.random() * candidates.length);
			const { r, c } = candidates.splice(idx, 1)[0];
			toRemoveSet.add(`${r}:${c}`);
		}
	}

	calculateRemovedElements() {
		let count = 0;
		for (let row = 0; row < this.rowsCount; row++) {
			for (let column = 0; column < this.columnsCount; column++) {
				if (this.matrix[row][column] === null) count++;
			}
		}
		return count;
	}

	dropElements() {
		for (let column = 0; column < this.columnsCount; column++) {
			this.dropElementsInColumn(column);
		}
		// Clear locks after processing the drop
		this.lockedThisDrop.clear();
	}

	dropElementsInColumn(column) {
		const current = [];
		const lockedRows = new Set();
		for (let row = 0; row < this.rowsCount; row++) {
			current.push(this.matrix[row][column]);
			if (this.lockedThisDrop.has(`${row}:${column}`)) lockedRows.add(row);
		}

		const result = new Array(this.rowsCount).fill(null);
		// Place locked tiles at their rows
		for (let row = 0; row < this.rowsCount; row++) {
			if (lockedRows.has(row)) result[row] = current[row];
		}
		// Collect movers (non-null and not locked)
		const movers = [];
		for (let row = this.rowsCount - 1; row >= 0; row--) {
			if (!lockedRows.has(row) && current[row] !== null) movers.push(current[row]);
		}
		// Fill from bottom up skipping locked rows
		let idx = 0;
		for (let row = this.rowsCount - 1; row >= 0; row--) {
			if (lockedRows.has(row)) continue;
			if (idx < movers.length) {
				result[row] = movers[idx++];
			}
		}
		// Write back
		for (let row = 0; row < this.rowsCount; row++) this.matrix[row][column] = result[row];
	}

	fillBlanks() {
		for (let row = 0; row < this.rowsCount; row++) {
			for (let column = 0; column < this.columnsCount; column++) {
				if (this.matrix[row][column] === null)
					this.matrix[row][column] = this.getRandomValue();
			}
		}
	}
}
