/** Chat Noir: can you stop the cat from escaping to freedom? */


// boundary object: this represents the single node that is freedom;
// spots on the edge of the board will be it's adjacencies

const boundary = { adjacent: [], distance: 0 };

const SVG_NS = "http://www.w3.org/2000/svg";

const DEBUG = false; 

/** Spot on the board */

class Spot {
  /** Make a spot:
   *
   *
   * - create the SVG circle
   * - create the text overlay for distance in debug mode
   * - set initial properties of spot
   */

  constructor(board, x, y) {
    // make SVG circle to represent this spot on board
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "spot");
    circle.setAttribute("cx", 20 + 33 * x + (y % 2 ? 20 : 0));
    circle.setAttribute("cy", 20 + 30 * y);
    circle.setAttribute("r", 13);
    circle.addEventListener("click", this.handleClick.bind(this));
    document.getElementById("board").appendChild(circle);
    this.svgCircle = circle;

    // make text label (for distances) overlaying this circle
    if (DEBUG) {
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("class", "debug");
      text.setAttribute("x", 20 + 33 * x + (y % 2 ? 20 : 0));
      text.setAttribute("y", 23 + 30 * y);
      document.getElementById("board").appendChild(text);
      this.svgText = text;
    }

    this.board = board;
    this.x = x;
    this.y = y;
    this.blocked = false;
    this.adjacent = []; // spots we can reach as neighbors
    this.distance = Infinity; // distance from boundary
  }

  /** Update the drawing of this spot.
   *
   * In order tp move the cat, we need to both erase the former cat
   * and then draw the new cat. Calling this with drawCat=false will
   * make not make this spot look like the cat, even if it currently is.
   */

  draw(drawCat = true) {
    let classes = "spot";
    if (this.blocked) classes += " blocked";
    if (drawCat && this.board.cat === this) classes += " cat";
    this.svgCircle.setAttribute("class", classes);
  }

  /** Main game: handle clicking on a cell to block it.
   *
   * Blocks cell, then has cat move.
   */

  handleClick(e) {
    // ignore clicks on the cat or already-blocked spots
    if (this.board.cat === this || this.blocked) return;
    this.blocked = true;
    this.draw();
    this.board.moveCat();
  }
}

/** Game board. */

class Board {
  /** Construct board.
   *
   * - Adjusts HTML SVG area to right size
   * - Creates grid map of spots
   * - Places initial cat randomly
   * - Places initial blocks randomly
   * - Draws initial board
   *
   */

  constructor(height, width, numBlocks) {
    console.assert(height % 2 && width % 2, "Height & width must be odd");

    this.height = height;
    this.width = width;
    const htmlBoard = document.getElementById("board");
    htmlBoard.setAttribute("width", width * 33 + 30);
    htmlBoard.setAttribute("height", height * 30 + 12);

    this.grid = {};

    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        // the top-left and bottom-left spots are superfluous: the spots next
        // to them are already on the boundary, so they're not needed to win.
        if (!(x === 0 && (y === 0 || y === this.height - 1)))
          this.grid[`${x}-${y}`] = new Spot(this, x, y);

    this.createGraph();
    this.setInitialCat();
    this.setInitialBlocks(numBlocks);
    this.drawInitialBoard();
    if (DEBUG) {
      this.updateDistances();
      this.showDistances();
    }
  }

  /** Put cat randomly in middle of board. */

  setInitialCat() {
    // return random spot in middle
    const x = Math.floor(this.width / 2.5 + Math.random() * (this.width / 5));
    const y = Math.floor(this.height / 2.5 + Math.random() * (this.height / 5));
    this.cat = this.grid[`${x}-${y}`];
  }

  /** Add random blocks around edges of board. */

  setInitialBlocks(numBlocks) {
    let i = 0;
    while (i < numBlocks) {
      const dx = Math.floor((Math.random() * this.width) / 4);
      const dy = Math.floor((Math.random() * this.height) / 4);
      const x = Math.random() < 0.5 ? dx : this.width - dx - 1;
      const y = Math.random() < 0.5 ? dy : this.height - dy - 1;
      const spot = this.grid[`${x}-${y}`];
      if (spot && !spot.blocked && this.cat !== spot) {
        spot.blocked = true;
        i += 1;
      }
    }
  }

  /** Draw initial board */

  drawInitialBoard() {
    for (let spot of Object.values(this.grid)) spot.draw();
  }

  /** Create graph of the neighbors of a spot.
   *
   * Also adds the edge spots as adjacent to the boundary.
   * This is only done once at the start of the game.
   *
   */

  createGraph() {
    for (let spot of Object.values(this.grid)) {
      const { x, y } = spot;
      let cands; // candidate neighbors

      // even rows: a cell at x=4,y=4 borders:  3,3  4,3  3,4  5,4  3,5  4,5
      // odd rows: a cell at x=4,y=3 borders:  4,2  5,2  3,3  5,3  4,4  5,4
      if (y % 2 == 0)
        cands = [
          this.grid[`${x - 1}-${y - 1}`],
          this.grid[`${x}-${y - 1}`],
          this.grid[`${x - 1}-${y}`],
          this.grid[`${x + 1}-${y}`],
          this.grid[`${x - 1}-${y + 1}`],
          this.grid[`${x}-${y + 1}`]
        ];
      else
        cands = [
          this.grid[`${x}-${y - 1}`],
          this.grid[`${x + 1}-${y - 1}`],
          this.grid[`${x - 1}-${y}`],
          this.grid[`${x + 1}-${y}`],
          this.grid[`${x}-${y + 1}`],
          this.grid[`${x + 1}-${y + 1}`]
        ];

      // remove "neighbors" that aren't in the grid
      spot.adjacent = cands.filter(neigh => neigh !== undefined);

      // if this spot is on boundary of grid, add as adjacency of boundary
      if (x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1) {
        boundary.adjacent.push(spot);
      }
    }
  }

  /** Update distances of every spot from the boundary.
   *
   * This is called after every move, since adding new blocked cells
   * changes this.
   *
   * This is a BFS of the adjacencies, the "distance" of a spot is
   * how far it is from the boundary.
   */

  updateDistances() {
    for (let key in this.grid) this.grid[key].distance = Infinity;

    const toVisit = [boundary];
    const seen = new Set();

    while (toVisit.length > 0) {
      const spot = toVisit.shift();

      for (let n of spot.adjacent) {
        if (seen.has(n) || n.blocked) continue;
        seen.add(n);
        n.distance = spot.distance + 1;
        toVisit.push(n);
      }
    }
  }

  /** Show distances  */
  showDistances() {
    for (let n of Object.values(this.grid))
      n.svgText.innerHTML = n.distance === Infinity ? "∞" : n.distance;
  }

  /** Return random best move for cat.
   *
   * Updates distances of each cell from boundary, then finds the shortest
   * distance the cat would need [it's best neighbor's distane], then randomly
   * selects a neighbor with the best distance.
   *
   */

  nextStepForCat() {
    this.updateDistances();
    if (DEBUG) this.showDistances();
    const adjToCat = this.cat.adjacent;
    const distancesNextToCat = adjToCat.map(n => n.distance);
    const minSteps = Math.min(...distancesNextToCat);
    const paths = adjToCat.filter(n => n.distance === minSteps);
    return paths[Math.floor(Math.random() * paths.length)];
  }

  /** Move cat */

  moveCat() {
    const move = this.nextStepForCat();

    if (move.distance === Infinity) return this.gameEnd("win");

    this.cat.draw(false);
    this.cat = move;
    this.cat.draw();

    if (this.cat.distance === 1) return this.gameEnd("lose");
  }



/** Announce end of game. */
gameEnd(outcome) {
    // 获取结果容器和消息文本
    const resultContainer = document.getElementById("game-result");
    const resultMessage = document.getElementById("result-message");

    // 设置消息内容
    resultMessage.textContent = outcome === "win" ? "🎉你赢了😁" : "🙄你输了😥";

    // 显示结果动画
    resultContainer.classList.add("show");

    // 在动画结束后移除容器（避免它一直显示）
    setTimeout(() => {
        resultContainer.classList.remove("show");
    }, 2500); // 动画持续时间 + 额外时间来显示消息
}
}


const board = new Board(11, 11, 6);


// 重置游戏功能
document.getElementById("reset-button").addEventListener("click", () => {
    // 清空现有的游戏板
    document.getElementById("board").innerHTML = "";

    // 重新初始化游戏板，并显示 6 个被阻塞的格子
    const newBoard = new Board(11, 11, 6);

});