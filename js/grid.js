import { Tile } from './tile.js';
import { delay } from './utils.js';

export class Grid {
	tiles = [];
	selectedTile = null;
	isGameBlocked = false;

	constructor(wrap, matrix) {
		this.wrap = wrap;
		this.createTiles(matrix);
	}

	createTiles(matrix) {
		for (let row = 0; row < matrix.length; row++) {
			for (let column = 0; column < matrix[0].length; column++) {
				this.createTile(row, column, matrix[row][column]);
			}
		}
	}

	async createTile(row, column, value) {
		const tile = new Tile(this.wrap, row, column, value, this.handleTileClick);
		this.tiles.push(tile);
		await tile.waitForAnimationEnd();
	}

	handleTileClick = (row, column) => {
		if (this.isGameBlocked) return;

		if (!this.selectedTile) {
			this.selectTile(row, column);
			return;
		}

		const isSelectedNeighbours = this.isSelectedTileNeighboursWith(row, column);
		if (!isSelectedNeighbours) {
			this.unselectTile();
			this.selectTile(row, column);
			return;
		}

		const firstElementPosition = {
			row: this.selectedTile.row,
			column: this.selectedTile.column,
		};
		const secondElementPosition = { row, column };

		const event = new CustomEvent('swap', {
			detail: {
				firstElementPosition,
				secondElementPosition,
			},
		});

		this.wrap.dispatchEvent(event);
	};

	selectTile(row, column) {
		this.selectedTile = this.findTileBy(row, column);
		this.selectedTile.select();
	}

	unselectTile() {
		this.selectedTile.unselect();
		this.selectedTile = null;
	}

	findTileBy(row, column) {
		return this.tiles.find(tile => tile.row === row && tile.column === column);
	}

	isSelectedTileNeighboursWith(row, column) {
		const isColumnNeighbours =
			this.selectedTile.column === column &&
			Math.abs(this.selectedTile.row - row) === 1;
		const isRowNeighbours =
			this.selectedTile.row === row &&
			Math.abs(this.selectedTile.column - column) === 1;
		return isColumnNeighbours || isRowNeighbours;
	}

	async swap(firstTilePosition, secondTilePosition, swapStates) {
		this.isGameBlocked = true;

		const firstTile = this.findTileBy(
			firstTilePosition.row,
			firstTilePosition.column
		);
		const secondTile = this.findTileBy(
			secondTilePosition.row,
			secondTilePosition.column
		);
		this.unselectTile();
		const firstTileAnimation = this.moveTileTo(firstTile, secondTilePosition);
		const secondTileAnimation = this.moveTileTo(secondTile, firstTilePosition);
		await Promise.all([firstTileAnimation, secondTileAnimation]);

		if (!swapStates) {
			const firstTileAnimation = this.moveTileTo(firstTile, firstTilePosition);
			const secondTileAnimation = this.moveTileTo(
				secondTile,
				secondTilePosition
			);
			await Promise.all([firstTileAnimation, secondTileAnimation]);
			this.isGameBlocked = false;
			return;
		}

		for (let i = 0; i < swapStates.length; i += 2) {
			await this.removeTiles(swapStates[i]);
			await this.dropTiles(swapStates[i], swapStates[i + 1]);
			await delay(100);
		}

		this.isGameBlocked = false;
	}

	async moveTileTo(tile, position) {
		const sameRow = tile.row === position.row;
		const sameCol = tile.column === position.column;
		if (sameRow && sameCol) return; // no movement, avoid waiting on transition
		tile.setPositionBy(position.row, position.column);
		await tile.waitForTransitionEnd();
	}

	async removeTiles(grid) {
		const animations = [];
		for (let row = 0; row < grid.length; row++) {
			for (let column = 0; column < grid[0].length; column++) {
				// Sync visuals for surviving tiles (e.g., when a normal becomes a special)
				if (grid[row][column] !== null) {
					const tile = this.findTileBy(row, column);
					if (tile) tile.setValue(grid[row][column]);
				}
				if (grid[row][column] === null) {
					const tile = this.findTileBy(row, column);
					const tileAnimation = tile.remove();
					this.removeTileFromArrayBy(row, column);
					animations.push(tileAnimation);
				}
			}
		}
		await Promise.all(animations);
	}

	removeTileFromArrayBy(row, column) {
		return (this.tiles = this.tiles.filter(
			tile => tile.row !== row || tile.column !== column
		));
	}

	async dropTiles(gridBefore, gridAfter) {
		const animations = [];
		for (let column = 0; column < gridBefore[0].length; column++) {
			const columnBefore = gridBefore.map(
				elementsInRow => elementsInRow[column]
			);
			const columnAfter = gridAfter.map(elementsInRow => elementsInRow[column]);
			const columnAnimation = this.dropTilesInColumn(
				columnBefore,
				columnAfter,
				column
			);
			animations.push(columnAnimation);
		}

		await Promise.all(animations);
	}

	async dropTilesInColumn(columnBefore, columnAfter, column) {
		// Prepare existing tiles bottom-to-top with their values
		const existing = [];
		for (let r = columnBefore.length - 1; r >= 0; r--) {
			if (columnBefore[r] !== null) {
				const tile = this.findTileBy(r, column);
				if (tile) existing.push({ tile, value: columnBefore[r] });
			}
		}

		// Destination positions bottom-to-top
		const destinations = [];
		for (let r = columnAfter.length - 1; r >= 0; r--) {
			if (columnAfter[r] !== null) destinations.push({ row: r, value: columnAfter[r] });
		}

		const usedExisting = new Array(existing.length).fill(false);
		const assignedRows = new Set();
		const moves = [];

		// Match by value first to keep specials anchored and identities stable
		for (let dIdx = 0; dIdx < destinations.length; dIdx++) {
			const dest = destinations[dIdx];
			let matchIdx = -1;
			for (let eIdx = 0; eIdx < existing.length; eIdx++) {
				if (usedExisting[eIdx]) continue;
				if (existing[eIdx].value === dest.value) { matchIdx = eIdx; break; }
			}
			if (matchIdx !== -1) {
				usedExisting[matchIdx] = true;
				assignedRows.add(dest.row);
				moves.push(this.moveTileTo(existing[matchIdx].tile, { row: dest.row, column }));
			}
		}

		// Assign remaining existing bottom-to-top to remaining destination rows bottom-to-top
		const remainingDestRows = destinations.map(d => d.row).filter(r => !assignedRows.has(r));
		let nextExisting = 0;
		for (let eIdx = 0; eIdx < existing.length && nextExisting < remainingDestRows.length; eIdx++) {
			if (usedExisting[eIdx]) continue;
			const rowTarget = remainingDestRows[nextExisting++];
			usedExisting[eIdx] = true;
			assignedRows.add(rowTarget);
			moves.push(this.moveTileTo(existing[eIdx].tile, { row: rowTarget, column }));
		}

		await Promise.all(moves);

		// Create any new tiles for destinations not covered by existing
		for (let r = 0; r < columnAfter.length; r++) {
			if (columnAfter[r] !== null && !assignedRows.has(r)) {
				await this.createTile(r, column, columnAfter[r]);
			}
		}
	}
}

