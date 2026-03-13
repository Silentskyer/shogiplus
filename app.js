const BOARD_SIZE = 9;
const PLAYER_BLACK = "B";
const PLAYER_WHITE = "W";

const PIECE = {
  KING: "K",
  ROOK: "R",
  BISHOP: "B",
  GOLD: "G",
  SILVER: "S",
  KNIGHT: "N",
  LANCE: "L",
  PAWN: "P",
};

const PROMOTABLE = new Set([
  PIECE.ROOK,
  PIECE.BISHOP,
  PIECE.SILVER,
  PIECE.KNIGHT,
  PIECE.LANCE,
  PIECE.PAWN,
]);

const HAND_ORDER = [
  PIECE.ROOK,
  PIECE.BISHOP,
  PIECE.GOLD,
  PIECE.SILVER,
  PIECE.KNIGHT,
  PIECE.LANCE,
  PIECE.PAWN,
];

const PIECE_LABEL = {
  K: "玉",
  R: "飛",
  B: "角",
  G: "金",
  S: "銀",
  N: "桂",
  L: "香",
  P: "步",
  "+R": "龍",
  "+B": "馬",
  "+G": "金",
  "+S": "成銀",
  "+N": "成桂",
  "+L": "成香",
  "+P": "成步",
};

const state = {
  board: [],
  hands: null,
  current: PLAYER_BLACK,
  selected: null,
  legalMoves: [],
  selectedDropType: null,
  legalDrops: [],
  gameOver: false,
  positionCounts: new Map(),
  multiplayer: {
    enabled: false,
    role: null,
    room: null,
    ws: null,
    pc: null,
    dc: null,
    ready: false,
  },
};

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const handBlackEl = document.getElementById("hand-black");
const handWhiteEl = document.getElementById("hand-white");
const roomInputEl = document.getElementById("room-code");
const connectBtnEl = document.getElementById("connect-btn");
const roomStatusEl = document.getElementById("room-status");

const SIGNAL_HOST = location.hostname || "localhost";
const SIGNAL_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${SIGNAL_HOST}:8080`;

function setRoomStatus(text) {
  if (roomStatusEl) {
    roomStatusEl.textContent = text;
  }
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

function createEmptyHands() {
  return {
    [PLAYER_BLACK]: {
      R: 0,
      B: 0,
      G: 0,
      S: 0,
      N: 0,
      L: 0,
      P: 0,
    },
    [PLAYER_WHITE]: {
      R: 0,
      B: 0,
      G: 0,
      S: 0,
      N: 0,
      L: 0,
      P: 0,
    },
  };
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function cloneHands(hands) {
  return {
    [PLAYER_BLACK]: { ...hands[PLAYER_BLACK] },
    [PLAYER_WHITE]: { ...hands[PLAYER_WHITE] },
  };
}

function placePiece(board, x, y, type, owner, promoted = false) {
  board[y][x] = { type, owner, promoted };
}

function setupInitialBoard() {
  const board = createEmptyBoard();

  // White (top)
  const topRow = [
    PIECE.LANCE,
    PIECE.KNIGHT,
    PIECE.SILVER,
    PIECE.GOLD,
    PIECE.KING,
    PIECE.GOLD,
    PIECE.SILVER,
    PIECE.KNIGHT,
    PIECE.LANCE,
  ];
  topRow.forEach((type, x) => placePiece(board, x, 0, type, PLAYER_WHITE));

  placePiece(board, 1, 1, PIECE.BISHOP, PLAYER_WHITE);
  placePiece(board, 7, 1, PIECE.ROOK, PLAYER_WHITE);

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    placePiece(board, x, 2, PIECE.PAWN, PLAYER_WHITE);
  }

  // Black (bottom)
  const bottomRow = [
    PIECE.LANCE,
    PIECE.KNIGHT,
    PIECE.SILVER,
    PIECE.GOLD,
    PIECE.KING,
    PIECE.GOLD,
    PIECE.SILVER,
    PIECE.KNIGHT,
    PIECE.LANCE,
  ];
  bottomRow.forEach((type, x) => placePiece(board, x, 8, type, PLAYER_BLACK));

  placePiece(board, 1, 7, PIECE.BISHOP, PLAYER_BLACK);
  placePiece(board, 7, 7, PIECE.ROOK, PLAYER_BLACK);

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    placePiece(board, x, 6, PIECE.PAWN, PLAYER_BLACK);
  }

  return board;
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function isEnemy(piece, owner) {
  return piece && piece.owner !== owner;
}

function otherPlayer(player) {
  return player === PLAYER_BLACK ? PLAYER_WHITE : PLAYER_BLACK;
}

function forwardDir(owner) {
  return owner === PLAYER_BLACK ? -1 : 1;
}

function isPromotionZone(owner, y) {
  return owner === PLAYER_BLACK ? y <= 2 : y >= 6;
}

function isLastRank(owner, y) {
  return owner === PLAYER_BLACK ? y === 0 : y === 8;
}

function isLastTwoRanks(owner, y) {
  return owner === PLAYER_BLACK ? y <= 1 : y >= 7;
}

function getPromotionAvailability(piece, fromY, toY) {
  if (!PROMOTABLE.has(piece.type) || piece.promoted) {
    return { canPromote: false, mustPromote: false };
  }
  const canPromote = isPromotionZone(piece.owner, fromY) || isPromotionZone(piece.owner, toY);
  if (!canPromote) return { canPromote: false, mustPromote: false };

  const mustPromote =
    (piece.type === PIECE.PAWN || piece.type === PIECE.LANCE) &&
    isLastRank(piece.owner, toY)
      ? true
      : piece.type === PIECE.KNIGHT && isLastTwoRanks(piece.owner, toY);

  return { canPromote, mustPromote };
}

function addToHand(hands, owner, piece) {
  const type = piece.type;
  hands[owner][type] += 1;
}

function removeFromHand(hands, owner, type) {
  hands[owner][type] -= 1;
}

function getAttackSquares(board, x, y) {
  const piece = board[y][x];
  if (!piece) return [];

  const squares = [];
  const dir = forwardDir(piece.owner);
  const addStep = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) return;
    squares.push({ x: nx, y: ny });
  };
  const addSlide = (dx, dy) => {
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny)) {
      squares.push({ x: nx, y: ny });
      if (board[ny][nx]) break;
      nx += dx;
      ny += dy;
    }
  };

  const typeKey = piece.promoted ? `+${piece.type}` : piece.type;

  switch (typeKey) {
    case PIECE.KING:
      addStep(0, 1);
      addStep(0, -1);
      addStep(1, 0);
      addStep(-1, 0);
      addStep(1, 1);
      addStep(1, -1);
      addStep(-1, 1);
      addStep(-1, -1);
      break;
    case PIECE.GOLD:
    case "+P":
    case "+L":
    case "+N":
    case "+S":
      addStep(0, dir);
      addStep(1, dir);
      addStep(-1, dir);
      addStep(1, 0);
      addStep(-1, 0);
      addStep(0, -dir);
      break;
    case PIECE.SILVER:
      addStep(0, dir);
      addStep(1, dir);
      addStep(-1, dir);
      addStep(1, -dir);
      addStep(-1, -dir);
      break;
    case PIECE.KNIGHT:
      addStep(1, dir * 2);
      addStep(-1, dir * 2);
      break;
    case PIECE.LANCE:
      addSlide(0, dir);
      break;
    case PIECE.PAWN:
      addStep(0, dir);
      break;
    case PIECE.ROOK:
      addSlide(0, 1);
      addSlide(0, -1);
      addSlide(1, 0);
      addSlide(-1, 0);
      break;
    case PIECE.BISHOP:
      addSlide(1, 1);
      addSlide(1, -1);
      addSlide(-1, 1);
      addSlide(-1, -1);
      break;
    case "+R":
      addSlide(0, 1);
      addSlide(0, -1);
      addSlide(1, 0);
      addSlide(-1, 0);
      addStep(1, 1);
      addStep(1, -1);
      addStep(-1, 1);
      addStep(-1, -1);
      break;
    case "+B":
      addSlide(1, 1);
      addSlide(1, -1);
      addSlide(-1, 1);
      addSlide(-1, -1);
      addStep(0, 1);
      addStep(0, -1);
      addStep(1, 0);
      addStep(-1, 0);
      break;
    default:
      break;
  }

  return squares;
}

function findKing(board, owner) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = board[y][x];
      if (piece && piece.owner === owner && piece.type === PIECE.KING) {
        return { x, y };
      }
    }
  }
  return null;
}

function isSquareAttacked(board, x, y, attacker) {
  for (let yy = 0; yy < BOARD_SIZE; yy += 1) {
    for (let xx = 0; xx < BOARD_SIZE; xx += 1) {
      const piece = board[yy][xx];
      if (piece && piece.owner === attacker) {
        const attacks = getAttackSquares(board, xx, yy);
        if (attacks.some((pos) => pos.x === x && pos.y === y)) {
          return true;
        }
      }
    }
  }
  return false;
}

function isInCheck(board, owner) {
  const king = findKing(board, owner);
  if (!king) return false;
  return isSquareAttacked(board, king.x, king.y, otherPlayer(owner));
}

function addMoveWithPromotion(piece, fromY, toX, toY, moves) {
  const availability = getPromotionAvailability(piece, fromY, toY);
  if (!availability.canPromote) {
    moves.push({ x: toX, y: toY, promote: false });
    return;
  }
  if (availability.mustPromote) {
    moves.push({ x: toX, y: toY, promote: true });
    return;
  }
  moves.push({ x: toX, y: toY, promote: false });
  moves.push({ x: toX, y: toY, promote: true });
}

function generatePseudoMoves(board, x, y) {
  const piece = board[y][x];
  if (!piece) return [];

  const moves = [];
  const dir = forwardDir(piece.owner);

  const addStep = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) return;
    const target = board[ny][nx];
    if (!target || isEnemy(target, piece.owner)) {
      addMoveWithPromotion(piece, y, nx, ny, moves);
    }
  };

  const addSlide = (dx, dy) => {
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny)) {
      const target = board[ny][nx];
      if (!target) {
        addMoveWithPromotion(piece, y, nx, ny, moves);
      } else {
        if (isEnemy(target, piece.owner)) {
          addMoveWithPromotion(piece, y, nx, ny, moves);
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  };

  const typeKey = piece.promoted ? `+${piece.type}` : piece.type;

  switch (typeKey) {
    case PIECE.KING:
      addStep(0, 1);
      addStep(0, -1);
      addStep(1, 0);
      addStep(-1, 0);
      addStep(1, 1);
      addStep(1, -1);
      addStep(-1, 1);
      addStep(-1, -1);
      break;
    case PIECE.GOLD:
    case "+P":
    case "+L":
    case "+N":
    case "+S":
      addStep(0, dir);
      addStep(1, dir);
      addStep(-1, dir);
      addStep(1, 0);
      addStep(-1, 0);
      addStep(0, -dir);
      break;
    case PIECE.SILVER:
      addStep(0, dir);
      addStep(1, dir);
      addStep(-1, dir);
      addStep(1, -dir);
      addStep(-1, -dir);
      break;
    case PIECE.KNIGHT:
      addStep(1, dir * 2);
      addStep(-1, dir * 2);
      break;
    case PIECE.LANCE:
      addSlide(0, dir);
      break;
    case PIECE.PAWN:
      addStep(0, dir);
      break;
    case PIECE.ROOK:
      addSlide(0, 1);
      addSlide(0, -1);
      addSlide(1, 0);
      addSlide(-1, 0);
      break;
    case PIECE.BISHOP:
      addSlide(1, 1);
      addSlide(1, -1);
      addSlide(-1, 1);
      addSlide(-1, -1);
      break;
    case "+R":
      addSlide(0, 1);
      addSlide(0, -1);
      addSlide(1, 0);
      addSlide(-1, 0);
      addStep(1, 1);
      addStep(1, -1);
      addStep(-1, 1);
      addStep(-1, -1);
      break;
    case "+B":
      addSlide(1, 1);
      addSlide(1, -1);
      addSlide(-1, 1);
      addSlide(-1, -1);
      addStep(0, 1);
      addStep(0, -1);
      addStep(1, 0);
      addStep(-1, 0);
      break;
    default:
      break;
  }

  return moves;
}

function applyMove(baseState, fromX, fromY, toX, toY, promote) {
  const next = {
    board: cloneBoard(baseState.board),
    hands: cloneHands(baseState.hands),
  };
  const moving = next.board[fromY][fromX];
  const target = next.board[toY][toX];
  if (target) {
    addToHand(next.hands, moving.owner, target);
  }
  next.board[toY][toX] = { ...moving, promoted: promote ? true : moving.promoted };
  next.board[fromY][fromX] = null;
  return next;
}

function applyDrop(baseState, owner, type, x, y) {
  const next = {
    board: cloneBoard(baseState.board),
    hands: cloneHands(baseState.hands),
  };
  next.board[y][x] = { type, owner, promoted: false };
  removeFromHand(next.hands, owner, type);
  return next;
}

function generateLegalMovesForPiece(x, y) {
  const piece = state.board[y][x];
  if (!piece || piece.owner !== state.current) return [];

  const pseudo = generatePseudoMoves(state.board, x, y);
  const legal = [];

  for (const move of pseudo) {
    const next = applyMove(state, x, y, move.x, move.y, move.promote);
    if (!isInCheck(next.board, piece.owner)) {
      legal.push(move);
    }
  }

  return legal;
}

function hasUnpromotedPawnOnFile(board, owner, x) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const piece = board[y][x];
    if (piece && piece.owner === owner && piece.type === PIECE.PAWN && !piece.promoted) {
      return true;
    }
  }
  return false;
}

function canDropOn(board, owner, type, x, y) {
  if (board[y][x]) return false;

  if (type === PIECE.PAWN) {
    if (isLastRank(owner, y)) return false;
    if (hasUnpromotedPawnOnFile(board, owner, x)) return false;
  }

  if (type === PIECE.LANCE) {
    if (isLastRank(owner, y)) return false;
  }

  if (type === PIECE.KNIGHT) {
    if (isLastTwoRanks(owner, y)) return false;
  }

  return true;
}

function isPawnDropMate(owner, x, y) {
  const opponent = otherPlayer(owner);
  const next = applyDrop(state, owner, PIECE.PAWN, x, y);

  if (!isInCheck(next.board, opponent)) return false;

  const kingPos = findKing(next.board, opponent);
  if (!kingPos) return false;

  // King escape
  const kingMoves = getAttackSquares(next.board, kingPos.x, kingPos.y).filter((pos) => {
    const target = next.board[pos.y][pos.x];
    return !target || target.owner !== opponent;
  });
  for (const move of kingMoves) {
    const sim = applyMove(next, kingPos.x, kingPos.y, move.x, move.y, false);
    if (!isInCheck(sim.board, opponent)) {
      return false;
    }
  }

  // Capture the dropped pawn
  for (let yy = 0; yy < BOARD_SIZE; yy += 1) {
    for (let xx = 0; xx < BOARD_SIZE; xx += 1) {
      const piece = next.board[yy][xx];
      if (!piece || piece.owner !== opponent || piece.type === PIECE.KING) continue;
      const attacks = getAttackSquares(next.board, xx, yy);
      if (attacks.some((pos) => pos.x === x && pos.y === y)) {
        const sim = applyMove(next, xx, yy, x, y, false);
        if (!isInCheck(sim.board, opponent)) {
          return false;
        }
      }
    }
  }

  return true;
}

function generateLegalDrops(type) {
  const legal = [];
  const owner = state.current;

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!canDropOn(state.board, owner, type, x, y)) continue;

      if (type === PIECE.PAWN && isPawnDropMate(owner, x, y)) {
        continue;
      }

      const next = applyDrop(state, owner, type, x, y);
      if (!isInCheck(next.board, owner)) {
        legal.push({ x, y, type });
      }
    }
  }

  return legal;
}

function hasAnyLegalMoveFor(owner) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = state.board[y][x];
      if (piece && piece.owner === owner) {
        const pseudo = generatePseudoMoves(state.board, x, y);
        for (const move of pseudo) {
          const next = applyMove(state, x, y, move.x, move.y, move.promote);
          if (!isInCheck(next.board, owner)) {
            return true;
          }
        }
      }
    }
  }

  const hand = state.hands[owner];
  for (const type of HAND_ORDER) {
    if (hand[type] > 0) {
      const drops = generateLegalDrops(type);
      if (drops.length > 0) return true;
    }
  }

  return false;
}

function updateStatus() {
  if (state.gameOver) return;

  const inCheck = isInCheck(state.board, state.current);
  const name = state.current === PLAYER_BLACK ? "黑方" : "白方";
  statusEl.textContent = inCheck ? `${name}回合（王手）` : `${name}回合`;

  if (!hasAnyLegalMoveFor(state.current)) {
    state.gameOver = true;
    const winner = otherPlayer(state.current) === PLAYER_BLACK ? "黑方" : "白方";
    statusEl.textContent = inCheck ? `${winner}勝（將死）` : "和局";
  }
}

function serializePosition() {
  const rows = state.board.map((row) =>
    row
      .map((piece) => {
        if (!piece) return "..";
        const promo = piece.promoted ? "+" : "";
        return `${piece.owner}${piece.type}${promo}`;
      })
      .join("")
  );
  const handBlack = HAND_ORDER.map((type) => state.hands[PLAYER_BLACK][type]).join(",");
  const handWhite = HAND_ORDER.map((type) => state.hands[PLAYER_WHITE][type]).join(",");
  return `${state.current}|${rows.join("/")}|${handBlack}|${handWhite}`;
}

function recordPosition() {
  const key = serializePosition();
  const count = state.positionCounts.get(key) || 0;
  state.positionCounts.set(key, count + 1);
  return count + 1;
}

function checkRepetition() {
  const count = recordPosition();
  if (count >= 4) {
    state.gameOver = true;
    statusEl.textContent = "千日手（和局）";
    return true;
  }
  return false;
}

function renderHands() {
  const renderHand = (owner, container) => {
    container.innerHTML = "";
    const title = document.createElement("div");
    title.className = "hand-title";
    title.textContent = owner === PLAYER_BLACK ? "黑方持駒" : "白方持駒";
    container.appendChild(title);

    const list = document.createElement("div");
    list.className = "hand-list";

    for (const type of HAND_ORDER) {
      const count = state.hands[owner][type];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hand-piece";
      button.dataset.type = type;
      button.dataset.owner = owner;
      button.textContent = `${PIECE_LABEL[type]} x${count}`;
      if (count === 0 || owner !== state.current || state.gameOver) {
        button.disabled = true;
      }
      if (state.selectedDropType === type && owner === state.current) {
        button.classList.add("active");
      }
      button.addEventListener("click", onHandClick);
      list.appendChild(button);
    }

    container.appendChild(list);
  };

  renderHand(PLAYER_BLACK, handBlackEl);
  renderHand(PLAYER_WHITE, handWhiteEl);
}

function renderBoard() {
  boardEl.innerHTML = "";

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const square = document.createElement("div");
      square.className = "square";
      square.dataset.x = x;
      square.dataset.y = y;

      const piece = state.board[y][x];
      if (piece) {
        const pieceEl = document.createElement("div");
        pieceEl.className = `piece ${piece.owner === PLAYER_WHITE ? "white" : "black"}`;
        if (piece.promoted) {
          pieceEl.classList.add("promoted");
        }
        const labelKey = piece.promoted ? `+${piece.type}` : piece.type;
        pieceEl.textContent = PIECE_LABEL[labelKey];
        square.appendChild(pieceEl);
      }

      if (state.selected && state.selected.x === x && state.selected.y === y) {
        square.classList.add("selected");
      }

      if (state.legalMoves.some((m) => m.x === x && m.y === y)) {
        square.classList.add("move");
      }

      if (state.legalDrops.some((m) => m.x === x && m.y === y)) {
        square.classList.add("drop");
      }

      square.addEventListener("click", onSquareClick);
      boardEl.appendChild(square);
    }
  }
}

function clearSelection() {
  state.selected = null;
  state.legalMoves = [];
}

function clearDropSelection() {
  state.selectedDropType = null;
  state.legalDrops = [];
}

function resolveMoveSelection(x, y) {
  const candidates = state.legalMoves.filter((m) => m.x === x && m.y === y);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const shouldPromote = window.confirm("要升變嗎？");
  return candidates.find((m) => m.promote === shouldPromote) || candidates[0];
}

function onSquareClick(event) {
  if (state.gameOver) return;
  if (state.multiplayer.enabled && state.multiplayer.role) {
    const isMyTurn =
      (state.multiplayer.role === "black" && state.current === PLAYER_BLACK) ||
      (state.multiplayer.role === "white" && state.current === PLAYER_WHITE);
    if (!isMyTurn) return;
  }

  const square = event.currentTarget;
  const x = Number(square.dataset.x);
  const y = Number(square.dataset.y);
  const piece = state.board[y][x];

  if (state.selectedDropType) {
    const drop = state.legalDrops.find((m) => m.x === x && m.y === y);
    if (drop) {
      const next = applyDrop(state, state.current, state.selectedDropType, x, y);
      state.board = next.board;
      state.hands = next.hands;
      clearDropSelection();
      if (state.multiplayer.enabled) {
        sendAction({ type: "drop", x, y, pieceType: state.selectedDropType });
      }
      swapTurn();
      if (checkRepetition()) {
        renderAll();
        return;
      }
      updateStatus();
      renderAll();
      return;
    }
    if (piece && piece.owner === state.current) {
      clearDropSelection();
    } else {
      clearDropSelection();
      renderAll();
      return;
    }
  }

  if (state.selected) {
    const chosen = resolveMoveSelection(x, y);
    if (chosen) {
      const next = applyMove(state, state.selected.x, state.selected.y, chosen.x, chosen.y, chosen.promote);
      state.board = next.board;
      state.hands = next.hands;
      if (state.multiplayer.enabled) {
        sendAction({
          type: "move",
          fromX: state.selected.x,
          fromY: state.selected.y,
          toX: chosen.x,
          toY: chosen.y,
          promote: chosen.promote,
        });
      }
      clearSelection();
      swapTurn();
      if (checkRepetition()) {
        renderAll();
        return;
      }
      updateStatus();
      renderAll();
      return;
    }
  }

  if (piece && piece.owner === state.current) {
    state.selected = { x, y };
    state.legalMoves = generateLegalMovesForPiece(x, y);
  } else {
    clearSelection();
  }

  renderAll();
}

function onHandClick(event) {
  if (state.gameOver) return;
  if (state.multiplayer.enabled && state.multiplayer.role) {
    const isMyTurn =
      (state.multiplayer.role === "black" && state.current === PLAYER_BLACK) ||
      (state.multiplayer.role === "white" && state.current === PLAYER_WHITE);
    if (!isMyTurn) return;
  }
  const button = event.currentTarget;
  const type = button.dataset.type;
  const owner = button.dataset.owner;
  if (owner !== state.current) return;

  if (state.selectedDropType === type) {
    clearDropSelection();
    renderAll();
    return;
  }

  clearSelection();
  state.selectedDropType = type;
  state.legalDrops = generateLegalDrops(type);
  renderAll();
}

function swapTurn() {
  state.current = state.current === PLAYER_BLACK ? PLAYER_WHITE : PLAYER_BLACK;
}

function renderAll() {
  renderBoard();
  renderHands();
}

function init() {
  state.board = setupInitialBoard();
  state.hands = createEmptyHands();
  state.positionCounts = new Map();
  recordPosition();
  renderAll();
  updateStatus();
}

init();

function sendAction(payload) {
  const dc = state.multiplayer.dc;
  if (dc && dc.readyState === "open") {
    dc.send(JSON.stringify({ type: "action", payload }));
  }
}

function applyRemoteAction(payload) {
  if (payload.type === "move") {
    const next = applyMove(state, payload.fromX, payload.fromY, payload.toX, payload.toY, payload.promote);
    state.board = next.board;
    state.hands = next.hands;
  }
  if (payload.type === "drop") {
    const next = applyDrop(state, state.current, payload.pieceType, payload.x, payload.y);
    state.board = next.board;
    state.hands = next.hands;
  }
  clearSelection();
  clearDropSelection();
  swapTurn();
  if (!checkRepetition()) {
    updateStatus();
  }
  renderAll();
}

function setupDataChannel(channel) {
  state.multiplayer.dc = channel;
  channel.onopen = () => {
    setRoomStatus(`連線成功（${state.multiplayer.role === "black" ? "黑方" : "白方"}）`);
  };
  channel.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "action") {
      applyRemoteAction(msg.payload);
    }
  };
  channel.onclose = () => {
    setRoomStatus("連線中斷");
  };
}

async function setupPeerConnection(isCaller) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  state.multiplayer.pc = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      state.multiplayer.ws.send(JSON.stringify({ type: "signal", data: { ice: event.candidate } }));
    }
  };

  pc.ondatachannel = (event) => {
    setupDataChannel(event.channel);
  };

  if (isCaller) {
    const channel = pc.createDataChannel("shogi");
    setupDataChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.multiplayer.ws.send(JSON.stringify({ type: "signal", data: { sdp: pc.localDescription } }));
  }
}

function attachSignaling(ws) {
  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "role") {
      state.multiplayer.role = msg.role;
      state.multiplayer.room = msg.room;
      setRoomStatus(`已加入房間 ${msg.room}，等待對手`);
      return;
    }
    if (msg.type === "ready") {
      const isCaller = state.multiplayer.role === "black";
      await setupPeerConnection(isCaller);
      return;
    }
    if (msg.type === "peer-left") {
      setRoomStatus("對手離線");
      return;
    }
    if (msg.type === "signal") {
      const pc = state.multiplayer.pc;
      if (!pc) return;
      if (msg.data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
        if (msg.data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "signal", data: { sdp: pc.localDescription } }));
        }
      }
      if (msg.data.ice) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.data.ice));
        } catch {
          // Ignore invalid candidates
        }
      }
    }
    if (msg.type === "error" && msg.message === "room_full") {
      setRoomStatus("房間已滿");
      connectBtnEl.disabled = false;
    }
  };

  ws.onclose = () => {
    setRoomStatus("信令連線中斷");
    connectBtnEl.disabled = false;
  };
}

function connectRoom() {
  const code = roomInputEl.value.trim().toUpperCase();
  if (!code) {
    setRoomStatus("請輸入房間碼");
    return;
  }
  connectBtnEl.disabled = true;
  state.multiplayer.enabled = true;
  const ws = new WebSocket(SIGNAL_URL);
  state.multiplayer.ws = ws;
  ws.onopen = () => {
    setRoomStatus("連線中...");
    ws.send(JSON.stringify({ type: "join", room: code }));
  };
  attachSignaling(ws);
}

if (connectBtnEl) {
  connectBtnEl.addEventListener("click", connectRoom);
}


