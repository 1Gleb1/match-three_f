export class Tile {
	constructor(wrap, row, column, value, handleTileClick) {
		this.handleTileClick = handleTileClick;
		this.tileElement = document.createElement('div');
		this.tileElement.classList.add('tile');
		this.setValue(value);
		this.setPositionBy(row, column);
		wrap.append(this.tileElement);
		this.tileElement.addEventListener('click', this.clickHandler);
	}

	setValue(value) {
		const previous = this.value;
		this.value = value;
		for (let i = 1; i <= 7; i++) this.tileElement.classList.remove(`tile${i}`);
		this.tileElement.classList.remove('special');
		this.tileElement
			.querySelectorAll('.aura, .shimmer')
			.forEach(el => el.remove());
		const abs = Math.abs(value);
		const base = abs > 100 ? abs % 100 : abs;
		const isSpecial = abs > 100;
		this.tileElement.classList.add(`tile${base}`);
		if (isSpecial) {
			this.tileElement.classList.add('special');
			const aura = document.createElement('div');
			aura.className = 'aura';
			const shimmer = document.createElement('div');
			shimmer.className = 'shimmer';
			this.tileElement.appendChild(aura);
			this.tileElement.appendChild(shimmer);
		}

		// If newly became special, request a one-drop-cycle row lock
		const prevAbs = previous === undefined ? null : Math.abs(previous);
		// if ((prevAbs === null || prevAbs <= 100) && abs > 100) {
		// 	this.lockRowForNextDrop = true;
		// }
	}

	setPositionBy(row, column) {
		this.row = row;
		this.column = column;
		this.tileElement.style.setProperty('--row', row);
		this.tileElement.style.setProperty('--column', column);
	}

	clickHandler = () => this.handleTileClick(this.row, this.column);

	select() {
		this.tileElement.classList.add('selected');
	}

	unselect() {
		this.tileElement.classList.remove('selected');
	}

	async remove() {
		this.tileElement.removeEventListener('click', this.clickHandler);
		this.tileElement.classList.add('hide');
		await this.waitForAnimationEnd();
		this.tileElement.remove();
	}

	waitForAnimationEnd() {
		return new Promise(resolve => {
			this.tileElement.addEventListener('animationend', resolve, {
				once: true,
			});
		});
	}

	waitForTransitionEnd() {
		return new Promise(resolve => {
			this.tileElement.addEventListener('transitionend', resolve, {
				once: true,
			});
		});
	}
}
