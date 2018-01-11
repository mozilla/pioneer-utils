export interface WeightedBranch {
  /** The name of the branch. */
  name: string;
  /** Weight of the branch. Defaults to 1. */
  weight?: number;
}

/**
 * Deterministically choose an option from `options` based on `hashKey`.
 */
export async function chooseWeighted(
  options: Array<WeightedBranch>,
  hashKey: string
): Promise<WeightedBranch> {
  if (options.length === 0) {
    throw new Error("Cannot choose from an empty set of options");
  }

  // Ensure all options have a weight assigned
  const weightedOptions = options.map(o => {
    o.weight = o.weight || 1;
    return o;
  });

  /* Conceptually, this works by making a space that is the range from
   * 0 to sum(weights), assigning each choice a proportional section
   * of that space, choosing a point in that space, and returning the
   * object that corresponds to that point.
   *
   * options = [{name: "A", weight: 1}, {name: "B", weight: 2}, {name: "C", weight: 3}]
   * totalWeight = 1 + 2 + 3 = 6
   * choice = hashFraction(input) * totalWeight = 1.5
   *
   * 0   1   2   3   4   5    6
   * | A |   B   |     C      |
   *       ^
   *        \_ choice = 1.5
   *           so return {name: "B", weight: 2}
   */
  const totalWeight = weightedOptions.map(o => o.weight).reduce((a, b) => a + b);
  let choice = await hashFraction(hashKey) * totalWeight;
  for (let opt of weightedOptions) {
    choice -= opt.weight;
    if (choice <= 0) {
      return opt;
    }
  }
  throw new Error("Assertion error, did not choose a value");
}

/**
 * @return Float between 0 and 1, inclusive.
 */
export async function hashFraction(input: string): Promise<number> {
  const hash = await sha256(input);
  const bits = 48; // meaningful precision of a 64bit floating point number
  const substringSize = bits / 4;
  return parseInt(hash.substr(0, substringSize), 16) / Math.pow(2, bits);
}

/**
 * @return Hex encoded sha256 hash.
 */
export async function sha256(message: string) {
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
