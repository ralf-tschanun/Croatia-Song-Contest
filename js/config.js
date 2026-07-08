// A'Croatia 2026 configuration
const API_URL = "https://script.google.com/macros/s/AKfycby0HFb7D7Z2q1jOAR1KWrf-mW21bIHbQ9qkpw001ipxrpeHxSyAWcq_gwGvxiaxctjR/exec";
const EVENT_ID = "acroatia-2026";

let SONGS = [];
let VOTERS = [];
let VOTED_VOTERS = [];

const pointMap = { p5: 5, p4: 4, p3: 3, p2: 2, p1: 1 };
const storageKeyFinal = `${EVENT_ID}:finalSubmitted`;
const storageKeyVote = `${EVENT_ID}:finalVote`;
