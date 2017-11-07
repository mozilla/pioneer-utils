/**
 * Deterministically choose an option from `options` based on `hashKey`.
 * @param {Array} options
 * @param {number?} options[].weight
 *   Optional, defaults to 1.
 * @param {string} hashKey
 * @returns {Object}
 *   One of the objects in `options`.
 */
export function chooseWeighted(options, hashKey) {
  if (options.length === 0) {
    throw new Error("Cannot choose from an empty set of options");
  }
  /* Conceptually, this works by making a space that is the range from
   * 0 to sum(weights), assigning each choice a proportional section
   * of that space, choosing a point in that space, and returning the
   * object that corresponds to that point.
   *
   * options = [{name: "A", weight: 1}, {name: "B", weight: 2}, {name: "C", weight: 3}]
   * maxWeight = 1 + 2 + 3 = 6
   * choice = hashFraction(input) * maxWeight = 1.5
   *
   * 0   1   2   3   4   5    6
   * | A |   B   |     C      |
   *       ^
   *        \_ choice = 1.5
   *           so return {name: "B", weight: 2}
   */
  const maxWeight = options.map(o => o.weight || 1).reduce((a, b) => a + b);
  let choice = hashFraction(hashKey) * maxWeight;
  for (let opt of options) {
    choice -= (opt.weight || 1);
    if (choice <= 0) {
      return opt;
    }
  }
  throw new Error("Assertion error, Did not chose a value");
}

/**
 * @param {string} input
 * @returns {number} Float between 0 and 1, inclusive.
 */
export async function hashFraction(input) {
  const hash = await sha256(input);
  const bits = 48; // meaningful precision of a 64bit floating point number
  const substringSize = bits / 4;
  return parseInt(hash.substr(0, substringSize), 16) / Math.pow(2, bits);
}

/**
 * @param {string} message
 * @returns {string} Hex encoded sha256 hash.
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder("utf-8").encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => ("00" + b.toString(16)).slice(-2)).join("");
  return hashHex;
}

export default {
  chooseWeighted,
  hashFraction,
  sha256,
};
