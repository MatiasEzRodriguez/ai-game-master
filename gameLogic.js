// gameLogic.js
const character = {
    name: "Grog el Bárbaro",
    stats: { fuerza: 15, destreza: 10, inteligencia: 8 },
    hp: 20
};

function rollDice(sides = 20) {
    return Math.floor(Math.random() * sides) + 1;
}

function calculateMod(statValue) {
    return Math.floor((statValue - 10) / 2);
}

module.exports = { character, rollDice, calculateMod };