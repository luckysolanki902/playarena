function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const word of words) {
    const normalized = normalizeWord(word);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function buildPromptPairs(
  left: readonly string[],
  right: readonly string[],
  formatter: (a: string, b: string) => string,
): string[] {
  const out: string[] = [];
  for (const a of left) {
    for (const b of right) {
      out.push(formatter(a, b));
    }
  }
  return out;
}

const EASY_ANIMALS = [
  'cat', 'dog', 'rabbit', 'hamster', 'mouse', 'rat', 'horse', 'cow', 'pig', 'sheep',
  'goat', 'donkey', 'camel', 'llama', 'alpaca', 'deer', 'moose', 'reindeer', 'bison', 'fox',
  'wolf', 'bear', 'panda', 'koala', 'kangaroo', 'otter', 'seal', 'walrus', 'beaver', 'badger',
  'raccoon', 'skunk', 'squirrel', 'hedgehog', 'bat', 'lion', 'tiger', 'cheetah', 'leopard', 'jaguar',
  'panther', 'elephant', 'rhino', 'hippo', 'giraffe', 'zebra', 'monkey', 'ape', 'gorilla', 'chimpanzee',
  'sloth', 'crocodile', 'alligator', 'shark', 'whale', 'dolphin', 'octopus', 'squid', 'crab', 'lobster',
  'jellyfish', 'starfish', 'goldfish', 'pufferfish', 'seahorse', 'turtle', 'snake', 'lizard', 'gecko', 'chameleon',
  'frog', 'toad', 'salamander', 'duck', 'goose', 'swan', 'owl', 'eagle', 'hawk', 'falcon',
  'parrot', 'peacock', 'penguin', 'flamingo', 'chicken', 'rooster', 'turkey', 'bee', 'butterfly', 'moth',
  'dragonfly', 'spider', 'ant', 'ladybug', 'grasshopper', 'scorpion', 'snail', 'worm', 'pearl oyster', 'stingray',
];

const EASY_FOODS = [
  'apple', 'banana', 'orange', 'grapes', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'watermelon', 'pineapple',
  'mango', 'peach', 'pear', 'plum', 'cherry', 'kiwi', 'lemon', 'lime', 'coconut', 'avocado',
  'carrot', 'potato', 'onion', 'garlic', 'tomato', 'cucumber', 'pickle', 'broccoli', 'cauliflower', 'cabbage',
  'lettuce', 'spinach', 'corn', 'peas', 'beans', 'pumpkin', 'mushroom', 'pepper', 'chili', 'egg',
  'bacon', 'sausage', 'ham', 'steak', 'chicken nugget', 'fries', 'burger', 'hot dog', 'pizza', 'sandwich',
  'taco', 'burrito', 'quesadilla', 'noodles', 'spaghetti', 'ramen', 'dumpling', 'sushi', 'fried rice', 'pancake',
  'waffle', 'toast', 'bagel', 'pretzel', 'donut', 'cookie', 'brownie', 'cupcake', 'muffin', 'cake',
  'pie', 'ice cream', 'popsicle', 'candy', 'chocolate', 'lollipop', 'marshmallow', 'cheese', 'butter', 'milk',
  'yogurt', 'cereal', 'coffee', 'tea', 'juice', 'soda', 'milkshake', 'smoothie', 'lemonade', 'boba',
  'soup', 'salad', 'popcorn', 'corn dog', 'nachos', 'trail mix', 'granola bar', 'jelly', 'honey', 'peanut butter',
];

const EASY_OBJECTS = [
  'chair', 'table', 'couch', 'bed', 'pillow', 'blanket', 'lamp', 'fan', 'heater', 'clock',
  'watch', 'mirror', 'window', 'door', 'key', 'lock', 'backpack', 'suitcase', 'wallet', 'purse',
  'umbrella', 'hat', 'cap', 'helmet', 'crown', 'glasses', 'sunglasses', 'ring', 'necklace', 'bracelet',
  'earring', 'shoe', 'boot', 'sock', 'glove', 'scarf', 'shirt', 'pants', 'dress', 'skirt',
  'jacket', 'sweater', 'belt', 'button', 'zipper', 'book', 'notebook', 'paper', 'newspaper', 'magazine',
  'pen', 'pencil', 'marker', 'crayon', 'paintbrush', 'eraser', 'ruler', 'scissors', 'glue', 'tape',
  'calculator', 'phone', 'tablet', 'laptop', 'keyboard', 'mouse', 'remote', 'camera', 'microphone', 'headphones',
  'speaker', 'television', 'radio', 'battery', 'flashlight', 'lightbulb', 'candle', 'soap', 'toothbrush', 'toothpaste',
  'comb', 'hairbrush', 'shampoo', 'towel', 'bucket', 'mop', 'broom', 'vacuum', 'toilet', 'bathtub',
  'shower', 'sink', 'faucet', 'cup', 'mug', 'bottle', 'plate', 'bowl', 'spoon', 'fork',
  'knife', 'pan', 'pot', 'kettle', 'blender', 'toaster', 'oven', 'stove', 'fridge', 'freezer',
  'jar', 'box', 'basket', 'trash can', 'balloon', 'kite', 'yo-yo', 'drum', 'guitar', 'piano',
  'violin', 'trumpet', 'flute', 'ball', 'baseball bat', 'tennis racket', 'skateboard', 'bicycle', 'scooter', 'roller skates',
];

const EASY_NATURE_AND_PLACES = [
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'thunder', 'snowflake', 'raindrop', 'wind',
  'tree', 'flower', 'rose', 'tulip', 'sunflower', 'daisy', 'cactus', 'bush', 'grass', 'leaf',
  'acorn', 'pinecone', 'river', 'lake', 'ocean', 'beach', 'island', 'pond', 'waterfall', 'mountain',
  'hill', 'volcano', 'desert', 'forest', 'jungle', 'swamp', 'cave', 'bridge', 'road', 'sidewalk',
  'park', 'playground', 'garden', 'farm', 'barn', 'house', 'cabin', 'castle', 'tower', 'palace',
  'lighthouse', 'windmill', 'school', 'hospital', 'library', 'museum', 'zoo', 'aquarium', 'restaurant', 'bakery',
  'market', 'store', 'garage', 'office', 'stadium', 'circus', 'carnival', 'camping tent', 'campfire', 'tree stump',
];

const EASY_TRANSPORT = [
  'car', 'truck', 'bus', 'taxi', 'ambulance', 'fire truck', 'police car', 'train', 'subway', 'tram',
  'airplane', 'helicopter', 'rocket', 'boat', 'ship', 'submarine', 'canoe', 'kayak', 'sailboat', 'hot air balloon',
  'tractor', 'forklift', 'bulldozer', 'motorcycle', 'moped', 'golf cart', 'monster truck', 'school bus', 'ice cream truck', 'trash truck',
];

const EASY_ACTIONS_AND_CHARACTERS = [
  'jump', 'run', 'walk', 'skip', 'hop', 'swim', 'dive', 'climb', 'crawl', 'dance',
  'sing', 'whistle', 'read', 'write', 'draw', 'paint', 'cook', 'bake', 'eat', 'drink',
  'nap', 'sleep', 'yawn', 'stretch', 'laugh', 'cry', 'wave', 'point', 'clap', 'cheer',
  'throw', 'catch', 'kick', 'punch', 'hug', 'high five', 'fish', 'ski', 'surf', 'snowboard',
  'bowl', 'box', 'ride', 'drive', 'dig', 'garden', 'juggle', 'meditate', 'sneeze', 'salute',
  'ghost', 'witch', 'wizard', 'dragon', 'unicorn', 'mermaid', 'pirate', 'ninja', 'robot', 'alien',
  'astronaut', 'superhero', 'supervillain', 'knight', 'princess', 'prince', 'king', 'queen', 'monster', 'zombie',
  'vampire', 'werewolf', 'clown', 'magician', 'detective', 'chef', 'doctor', 'nurse', 'teacher', 'artist',
  'musician', 'farmer', 'firefighter', 'police officer', 'construction worker', 'pilot', 'scientist', 'beekeeper', 'gardener', 'photographer',
];

const MEDIUM_OBJECTS = [
  'alarm clock', 'teddy bear', 'watering can', 'treasure chest', 'coffee mug', 'tea kettle', 'snow globe', 'beach ball', 'pinwheel', 'toy train',
  'toy robot', 'board game', 'chessboard', 'dart board', 'trophy cup', 'piggy bank', 'vacuum cleaner', 'shopping cart', 'traffic light', 'street lamp',
  'fire hydrant', 'roller coaster', 'ferris wheel', 'bumper car', 'merry go round', 'sleeping bag', 'picnic basket', 'birdhouse', 'dog house', 'cat tower',
  'fish bowl', 'toy airplane', 'paper airplane', 'gift box', 'birthday candle', 'party hat', 'rain boots', 'rubber duck', 'soap bubble', 'bubble wand',
  'toothbrush cup', 'alarm bell', 'frying pan', 'mixing bowl', 'measuring cup', 'cookie jar', 'pepper grinder', 'cutting board', 'lunch box', 'lunch tray',
  'tool box', 'first aid kit', 'garden hose', 'sewing machine', 'washing machine', 'oven mitt', 'chef hat', 'graduation cap', 'paint roller', 'flower pot',
  'hanging plant', 'soccer goal', 'basketball hoop', 'goal post', 'bowling pin', 'tennis ball', 'baseball glove', 'hockey stick', 'ice skate', 'surf board',
  'snorkel mask', 'diving helmet', 'camping lantern', 'pocket watch', 'hourglass', 'map pin', 'microscope slide', 'telescope lens', 'magic wand', 'crystal ball',
  'jack o lantern', 'snow shovel', 'wheelbarrow', 'pogo stick', 'hula hoop', 'jump rope', 'toy drum', 'toy piano', 'ice cube tray', 'waffle iron',
  'water gun', 'wind chime', 'raincoat', 'mailbox', 'postcard', 'ticket stub', 'guitar pick', 'sketchbook', 'rubber stamp', 'video game controller',
];

const MEDIUM_FOODS = [
  'ice cream cone', 'birthday cake', 'grilled cheese', 'jelly sandwich', 'spaghetti and meatballs', 'chicken noodle soup', 'tomato soup', 'fruit salad', 'pancake stack', 'waffle stack',
  'cotton candy', 'caramel apple', 'popcorn bucket', 'potato chips', 'chocolate milk', 'hot chocolate', 'chocolate chip cookie', 'peanut butter cookie', 'cheese pizza', 'pepperoni pizza',
  'birthday cupcake', 'strawberry milkshake', 'banana split', 'sushi roll', 'fortune cookie', 'spring roll', 'fried egg', 'scrambled eggs', 'corn dog', 'cheeseburger',
  'bacon sandwich', 'grilled corn', 'mashed potatoes', 'garlic bread', 'chicken wings', 'fish sticks', 'milk carton', 'juice box', 'cereal bowl', 'cinnamon roll',
  'jelly donut', 'gummy bear', 'candy cane', 'trail mix', 'avocado toast', 'blueberry muffin', 'pumpkin pie', 'cherry pie', 'apple pie', 'taco shell',
  'cookie dough', 'buttered toast', 'pasta salad', 'rice bowl', 'burrito bowl', 'nacho plate', 'picnic sandwich', 'smoothie bowl', 'waffle cone', 'pretzel twist',
];

const MEDIUM_PLACES_AND_ACTIVITIES = [
  'treehouse', 'sand castle', 'tree swing', 'soccer field', 'basketball court', 'tennis court', 'skate park', 'ice rink', 'swimming pool', 'diving board',
  'picnic table', 'bus stop', 'phone booth', 'gas pump', 'post office', 'train tunnel', 'subway car', 'movie theater', 'art studio', 'science lab',
  'music room', 'classroom desk', 'locker room', 'flower shop', 'pet store', 'toy store', 'book store', 'coffee shop', 'donut shop', 'pizza shop',
  'fruit stand', 'vegetable garden', 'pumpkin patch', 'corn maze', 'haunted house', 'pirate ship', 'treasure island', 'dragon cave', 'wizard tower', 'space station',
  'moon base', 'rocket launch', 'race track', 'dog park', 'beach umbrella', 'beach towel', 'life jacket', 'road sign', 'stop sign', 'picnic blanket',
  'mail truck', 'ice cream truck', 'cable car', 'subway map', 'car wash', 'lemonade stand', 'birthday party', 'sleepover party', 'tea party', 'pool float',
  'fishing rod', 'tackle box', 'camp stove', 'karaoke machine', 'treasure map', 'magic mirror', 'photo booth', 'karaoke stage', 'drum set', 'grocery aisle',
];

const MEDIUM_SCENES = [
  'cat nap', 'dog walk', 'bear hug', 'chicken dance', 'happy clown', 'sleepy sloth', 'dancing robot', 'singing bird', 'flying kite', 'blowing bubbles',
  'reading book', 'painting fence', 'baking cookies', 'making pizza', 'building snowman', 'planting flowers', 'washing car', 'folding laundry', 'brushing teeth', 'taking selfie',
  'riding scooter', 'driving tractor', 'feeding ducks', 'feeding fish', 'watering plants', 'roasting marshmallows', 'opening gift', 'wrapping present', 'juggling balls', 'popping balloon',
  'playing cards', 'playing chess', 'playing drums', 'strumming guitar', 'kicking soccer ball', 'shooting basketball', 'throwing frisbee', 'catching butterfly', 'climbing ladder', 'rowing boat',
  'steering ship', 'waving flag', 'polishing trophy', 'mixing batter', 'slicing watermelon', 'flipping pancake', 'cracking egg', 'carrying suitcase', 'chasing chicken', 'jumping puddle',
  'dodging lightning', 'exploring cave', 'digging treasure', 'reading map', 'tying shoe', 'blowing trumpet', 'watering cactus', 'hugging teddy bear', 'petting cat', 'petting dog',
  'feeding hamster', 'cleaning window', 'fixing bike', 'painting rainbow', 'making sandwich', 'building tower', 'stacking pancakes', 'folding blanket', 'opening umbrella', 'shaving beard',
  'combing hair', 'packing backpack', 'sharpening pencil', 'pouring juice', 'squeezing lemon', 'peeling banana', 'opening coconut', 'watering garden', 'playing piano', 'walking penguin',
  'skipping rope', 'surfing wave', 'skiing downhill', 'boxing glove', 'cheering crowd', 'singing karaoke', 'camping trip', 'snowball fight', 'cookie thief', 'messy painter',
];

const FUN_ANIMALS = [
  'cat', 'dog', 'penguin', 'shark', 'octopus', 'crocodile', 'giraffe', 'elephant', 'panda', 'koala',
  'monkey', 'tiger', 'lion', 'fox', 'rabbit', 'bear', 'owl', 'flamingo', 'turtle', 'whale',
  'dolphin', 'kangaroo', 'zebra', 'hippo',
];

const FUN_WEARABLES = [
  'sunglasses', 'top hat', 'bow tie', 'cowboy hat', 'party hat', 'crown',
  'scarf', 'helmet', 'backpack', 'rain boots', 'headphones', 'tiara',
];

const FUN_PROPS = [
  'umbrella', 'balloon', 'ice cream cone', 'pizza slice', 'coffee mug', 'treasure map',
  'camera', 'guitar', 'paintbrush', 'telescope', 'microphone', 'broom',
  'torch', 'flower bouquet', 'skateboard', 'surfboard', 'teddy bear', 'book',
  'basketball', 'cupcake',
];

const FUN_VEHICLES = [
  'bicycle', 'scooter', 'skateboard', 'roller skates', 'rocket', 'boat',
  'submarine', 'tractor', 'fire truck', 'school bus', 'hot air balloon', 'sleigh',
];

const FUN_FOODS = [
  'pizza', 'burger', 'taco', 'sushi', 'donut', 'pancakes',
  'waffles', 'ice cream', 'cupcake', 'spaghetti', 'popcorn', 'watermelon',
  'sandwich', 'ramen', 'cookies', 'hot dog', 'birthday cake', 'burrito',
];

const FUN_CHARACTERS = [
  'astronaut', 'pirate', 'ninja', 'wizard', 'witch', 'robot', 'alien', 'superhero', 'detective', 'clown',
  'knight', 'princess', 'dragon', 'mermaid', 'ghost', 'cowboy', 'samurai', 'beekeeper', 'scientist', 'chef',
];

const FUN_JOBS = [
  'chef', 'doctor', 'teacher', 'artist', 'musician', 'farmer', 'firefighter', 'police officer', 'construction worker', 'pilot',
  'barber', 'mechanic', 'photographer', 'baker', 'gardener', 'magician', 'mail carrier', 'lifeguard', 'scientist', 'skater',
];

const FUN_PLACES = [
  'treehouse', 'castle', 'playground', 'beach', 'space station', 'carnival',
  'library', 'campfire', 'haunted house', 'picnic table', 'volcano', 'island',
  'garage', 'bakery', 'aquarium',
];

const HARD_SCENES = [
  'octopus playing drums', 'dragon in bathtub', 'shark brushing teeth', 'penguin at karaoke', 'robot making pancakes', 'wizard stuck in traffic',
  'pirate at dentist', 'alien in grocery cart', 'cowboy on roller skates', 'chef juggling oranges', 'ninja with birthday cake', 'astronaut in hammock',
  'ghost doing yoga', 'clown stuck in umbrella', 'mermaid reading newspaper', 'detective chasing donut', 'koala with leaf blower', 'panda at tea party',
  'giraffe in elevator', 'turtle with jetpack', 'bear on tiny bicycle', 'fox with magic wand', 'owl delivering mail', 'hippo in kiddie pool',
  'flamingo on trampoline', 'elephant painting portrait', 'monkey on laptop', 'rabbit in space helmet', 'lion with flower bouquet', 'whale in rain boots',
  'dolphin with treasure chest', 'kangaroo at campfire', 'zebra in barber chair', 'chef under waterfall', 'scientist on pogo stick', 'baker in snowstorm',
  'firefighter watering cactus', 'teacher on pirate ship', 'doctor at carnival', 'mechanic with balloon animals', 'photographer on camel', 'lifeguard in library',
  'magician on surfboard', 'mail carrier on moon base', 'pilot in treehouse', 'artist inside snow globe', 'gardener in submarine', 'police officer at tea party',
];

const EASY_WORDS = uniqueWords([
  ...EASY_ANIMALS,
  ...EASY_FOODS,
  ...EASY_OBJECTS,
  ...EASY_NATURE_AND_PLACES,
  ...EASY_TRANSPORT,
  ...EASY_ACTIONS_AND_CHARACTERS,
]);

const MEDIUM_WORDS = uniqueWords([
  ...MEDIUM_OBJECTS,
  ...MEDIUM_FOODS,
  ...MEDIUM_PLACES_AND_ACTIVITIES,
  ...MEDIUM_SCENES,
]);

const HARD_WORDS = uniqueWords([
  ...HARD_SCENES,
  ...buildPromptPairs(FUN_ANIMALS, FUN_WEARABLES, (animal, wearable) => `${animal} wearing ${wearable}`),
  ...buildPromptPairs(FUN_ANIMALS, FUN_PROPS, (animal, prop) => `${animal} holding ${prop}`),
  ...buildPromptPairs(FUN_ANIMALS, FUN_VEHICLES, (animal, vehicle) => `${animal} riding ${vehicle}`),
  ...buildPromptPairs(FUN_CHARACTERS, FUN_FOODS, (character, food) => `${character} eating ${food}`),
  ...buildPromptPairs(FUN_CHARACTERS, FUN_VEHICLES, (character, vehicle) => `${character} on ${vehicle}`),
  ...buildPromptPairs(FUN_JOBS, FUN_PROPS, (job, prop) => `${job} with ${prop}`),
  ...buildPromptPairs(FUN_JOBS, FUN_PLACES, (job, place) => `${job} at ${place}`),
]);

const SCRIBBLE_POOLS = {
  easy: EASY_WORDS,
  medium: MEDIUM_WORDS,
  hard: HARD_WORDS,
} as const;

export const SCRIBBLE_WORDS: readonly string[] = uniqueWords([
  ...SCRIBBLE_POOLS.easy,
  ...SCRIBBLE_POOLS.medium,
  ...SCRIBBLE_POOLS.hard,
]);

export const SCRIBBLE_WORD_COUNT = SCRIBBLE_WORDS.length;

function pickUnique(pool: readonly string[], used: Set<string>): string | null {
  const available = pool.filter((word) => !used.has(word));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function getWordChoices(count = 3): string[] {
  if (count <= 0) return [];

  const used = new Set<string>();
  const out: string[] = [];

  const addChoice = (pool: readonly string[]) => {
    const word = pickUnique(pool, used);
    if (!word) return;
    used.add(word);
    out.push(word);
  };

  if (count >= 3) {
    addChoice(SCRIBBLE_POOLS.easy);
    addChoice(SCRIBBLE_POOLS.medium);
    addChoice(SCRIBBLE_POOLS.hard);
  }

  const allPools = [SCRIBBLE_POOLS.easy, SCRIBBLE_POOLS.medium, SCRIBBLE_POOLS.hard];
  while (out.length < count && used.size < SCRIBBLE_WORDS.length) {
    const pool = allPools[Math.floor(Math.random() * allPools.length)];
    addChoice(pool);
  }

  return out.sort(() => Math.random() - 0.5);
}
