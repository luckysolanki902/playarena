export const SCRIBBLE_WORDS: readonly string[] = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'frog', 'bear', 'fox', 'horse', 'cow', 'duck',
  'lion', 'tiger', 'elephant', 'monkey', 'penguin', 'dolphin', 'shark', 'whale',
  'rabbit', 'turtle', 'snake', 'eagle', 'owl', 'parrot', 'flamingo', 'giraffe',
  'zebra', 'hippo', 'crocodile', 'butterfly', 'bee', 'spider', 'ant', 'ladybug',
  'snail', 'octopus', 'crab', 'lobster', 'jellyfish', 'panda', 'koala', 'kangaroo',
  'deer', 'wolf', 'sheep', 'pig', 'chicken', 'rooster', 'peacock', 'swan',

  // Food & Drinks
  'apple', 'banana', 'pizza', 'cake', 'burger', 'hotdog', 'taco', 'sushi',
  'cookie', 'donut', 'icecream', 'cupcake', 'sandwich', 'salad', 'soup',
  'steak', 'noodles', 'egg', 'bacon', 'cheese', 'bread', 'toast', 'waffle',
  'pancake', 'strawberry', 'watermelon', 'cherry', 'grapes', 'orange', 'lemon',
  'pineapple', 'mango', 'avocado', 'carrot', 'broccoli', 'corn', 'potato',
  'mushroom', 'popcorn', 'pretzel', 'candy', 'lollipop', 'chocolate', 'coffee',
  'milkshake', 'juice', 'tea', 'boba',

  // Everyday Objects
  'chair', 'table', 'lamp', 'clock', 'mirror', 'umbrella', 'key', 'lock',
  'bag', 'hat', 'boot', 'sock', 'shirt', 'dress', 'glasses', 'ring',
  'coin', 'book', 'pen', 'pencil', 'scissors', 'ruler', 'brush', 'comb',
  'toothbrush', 'soap', 'towel', 'pillow', 'blanket', 'cup', 'mug', 'spoon',
  'fork', 'knife', 'plate', 'bowl', 'pot', 'pan', 'blender', 'phone',
  'laptop', 'camera', 'headphones', 'battery', 'lightbulb', 'candle', 'bottle',

  // Nature & Places
  'tree', 'flower', 'grass', 'cloud', 'sun', 'moon', 'star', 'rainbow',
  'mountain', 'hill', 'river', 'lake', 'ocean', 'beach', 'island', 'desert',
  'forest', 'cave', 'volcano', 'waterfall', 'snowflake', 'lightning', 'tornado',
  'house', 'castle', 'tower', 'bridge', 'road', 'school', 'hospital', 'park',
  'playground', 'garden', 'farm', 'barn', 'lighthouse', 'windmill',

  // Transport
  'car', 'bus', 'truck', 'bike', 'motorcycle', 'train', 'plane', 'helicopter',
  'rocket', 'ship', 'boat', 'submarine', 'sailboat', 'canoe', 'taxi', 'ambulance',
  'firetruck', 'tractor', 'scooter', 'skateboard', 'balloon',

  // Sports & Activities
  'soccer', 'basketball', 'tennis', 'baseball', 'golf', 'bowling', 'swimming',
  'skiing', 'surfing', 'fishing', 'camping', 'hiking', 'dancing', 'yoga',
  'boxing', 'archery', 'cycling', 'running',

  // Actions & Concepts
  'sleep', 'eat', 'drink', 'jump', 'run', 'swim', 'fly', 'climb', 'wave',
  'laugh', 'cry', 'sing', 'read', 'write', 'draw', 'cook', 'paint', 'hug',
  'sneeze', 'yawn', 'whistle', 'clap', 'point', 'kick', 'throw', 'catch',

  // Fun / Misc
  'ghost', 'witch', 'wizard', 'dragon', 'unicorn', 'mermaid', 'robot',
  'alien', 'astronaut', 'pirate', 'ninja', 'superhero', 'crown', 'trophy',
  'medal', 'gift', 'kite', 'yo-yo', 'magnet', 'magnifying glass', 'compass',
  'telescope', 'microscope', 'hammer', 'wrench', 'saw', 'ladder', 'rope',
  'net', 'tent', 'campfire', 'lantern', 'map', 'treasure', 'anchor',
  'flag', 'ticket', 'mask', 'puppet', 'puzzle', 'dice', 'chess', 'cards',
];

export function getWordChoices(count = 3): string[] {
  const pool = [...SCRIBBLE_WORDS];
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
