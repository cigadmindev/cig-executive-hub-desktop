// Daily opening and closing checklists - Taste Italian Kitchen, Starkville
// and Ridgeland. Transcribed from each location's printed sheets (Oct 2026). Each task: [title, details]
// with optional { day } (0 Sunday ... 6 Saturday) for tasks that only apply
// one day a week, and { section } for the Server closing "Section" column.
// Groups (BOH stations) are rows whose title starts with '## '.
//
// The day's record copies the tasks for that day, so editing a list here
// never changes a checklist already started or filed.
//
// Each location runs its own lists (LISTS_AT below). A list may also carry
// notes: [key, label] pairs for the free-text boxes at the foot of a sheet
// ("Maintenance / Equipment Issues"…), printed on the filed PDF.

// Which lists each location runs, in the order they show. Kept in step with
// LISTS in functions/dailyChecklists.js.
const LISTS_AT = {
  // Kitchen Opening (Ridgeland's AM chef sheet) added 14 Oct 2026.
  'taste-starkville': ['host-opening', 'server-opening', 'bar-opening', 'veranda-opening', 'kitchen-opening', 'host-closing', 'server-closing', 'bar-closing', 'boh-closing'],
  // Ridgeland, set up like Starkville (Brenner, 12 Oct 2026): its own kitchen
  // sheets, and Starkville's front of house adapted for Ridgeland.
  'taste-ridgeland': [
    'ridgeland-manager-opening', 'ridgeland-host-opening', 'ridgeland-server-opening', 'ridgeland-bar-opening', 'ridgeland-terrazza-opening', 'ridgeland-chef-opening',
    'ridgeland-host-closing', 'ridgeland-server-closing', 'ridgeland-bar-closing', 'ridgeland-chef-closing', 'ridgeland-manager-closing',
  ],
};
export const DAILY_LOCATIONS = Object.keys(LISTS_AT);

const T = (title, details = '', extra = {}) => ({ title, details, ...extra });
const G = (name) => ({ group: name });

export const DAILY_CHECKLISTS = [
  {
    id: 'host-opening', kind: 'opening', title: 'Host Opening Checklist', subtitle: 'Front of House — Pre-Shift Setup & Readiness',
    workers: ['Host'],
    intro: "The opening host completes every task below before service begins and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      T('Turn On Lights', "There's a switch by the outlet under the counter for the overhead light. The dimmer for the rope lights is under the counter, top right — slide it all the way to fully turn the lights on."),
      T('Report Low or Out-of-Stock Supplies', "Let the manager on duty know if you're low on or out of anything — e.g. call logbook, mints, Windex, sanitizer spray, wobble wedges, pens, scratch paper, menus."),
      T('Sanitize Menus', 'Ensure all menus are clean and sanitized prior to the start of service.'),
      T('Roll Out Rugs', 'Logo mat at the front door, readable as guests walk in; one runner directly in front of the host stand; one runner rolled out behind the host stand. Vacuum or sweep every rug clean before opening.'),
      T('Restock Mints', 'Restock the mints at the host stand.'),
      T('Check Business Cards', 'Let the manager on duty know if business cards need to be replenished.'),
      T('Set Up iPads', "Log in, open OpenTable, and confirm you're on the correct shift. Review the day's reservations and notes, and check with the manager on duty about any accommodations or special events."),
      T('Sweep Foyer / Front Hallway', 'Sweep thoroughly, including behind the doors that stay propped open through service, from the foyer through to the Main Dining Room entrance.'),
      T('Clean Windows & Doors', 'Using Windex and a microfiber cloth: both sets of front doors and the window overlooking the patio, the windows into the Veranda and the Veranda door windows, and the wine room.'),
      T('Confirm Large-Party Reservations', "Call every Lunch and Dinner reservation of 12+ guests to confirm party size. For a private large party, check with the manager on duty first — they'll likely make that call themselves."),
    ],
  },
  {
    id: 'server-opening', kind: 'opening', title: 'Server Opening Checklist', subtitle: 'Taste Italian Kitchen · Front of House',
    workers: ['Server'],
    intro: 'Complete each task before opening and initial the box once it is done.',
    tasks: [
      T('Bread Warmer', 'Turn the dials on the bread warmer to 6. Grab two 400 pans from the shelves by the dish area and put in the warmer. Check the walk-in for bread from the previous night before opening fresh loaves. Slice loaves in half and store in the top section to begin warming. Do not cut bread into serving slices until 10:45 AM or later. Once slicing, put a damp rag in an eighth pan in the bottom tray to keep the bread from drying out.'),
      T('Set up your drink station', 'Wipe nozzles until dry and attach to the machine. Ensure your ice scoop is clean.'),
      T('Stock ice fully in the drink station'),
      T('Make tea', '1. Ensure the nozzles are clean and properly assembled: connect the white silicone piece to the top of the nozzle until it clicks, screw the spout on, and twist the washer toward the nozzle until it does not budge.\n2. Place one bag of Ceylon Tea in the decanter, shift the decanter fully to the side you are brewing into, set the Left — Right switch to that side, and hit start.\n3. For sweet tea, use 8 cups of sugar: when the urn is about halfway full, pour the sugar in slowly while whisking.'),
      T('Roll out rugs', '– One runner in the hallway between the kitchen and the doors to the bar/dining room.\n– One logo mat in front of the Veranda doors, facing the dining room.\n– A logo mat in front of the server station, and a runner between it and the dining room.\n– Two runners evenly spaced in the hallway to the bar.\n– One runner in front of the host stand, and a logo mat in the front entrance facing the front door.'),
      T('Set up parmesan bowls', 'Use the Bellacibo grated Parmesan on the bottom left cheese shelf of the walk-in — look for an open bag before opening a new one. Two bowls for the main dining server station, with spoons.'),
      T('Tray Linens', 'Cover each tray with a fresh linen, seam side down.'),
      T('Refrigeration Well', 'Set up the refrigeration well for lemons, butter chips and heavy cream by filling it about 1/3 of the way with ice.'),
      T('Lemons', "Check the walk-in for lemons from the previous day. If there are none, cut fresh lemons into wedges (6–8 per lemon) to fill a plastic third pan, label with the date, and store in the refrigeration well."),
      T('Do a walkthrough of your section', "– Place settings equally spaced, a half-inch from the table's edge.\n– Chairs halfway pulled out, legs not over the table bases.\n– No wobbly tables — use wobble wedges or tell a manager.\n– No crumbs on chairs, tables or floor.\n– Oil and vinegar bottles refilled as needed.\n– Light fixtures and trim/baseboards free of dust."),
      T('Stock to-go items', 'Logo cups and lids, Styrofoam cups and lids, small and large clamshell boxes, and logo bags.'),
      T('Bread folds / stock baskets', 'Fold enough linens to fill every bread basket, then fold 30 more for "hot hands"/refills.'),
      T('Fold table linens as needed', 'Fill the bins underneath the server station, then fold 20 extra for resetting tables during service.'),
      T('Check bathrooms', "– New bag in each trash can, including the small ones in the women's stalls.\n– Clean the mirror as needed.\n– Stock hand towels, soap and toilet paper.\n– Sweep if necessary."),
    ],
  },
  {
    id: 'bar-opening', kind: 'opening', title: 'Main Bar Opening Checklist', subtitle: 'Beverage Program — Pre-Shift Bar Setup & Readiness',
    workers: ['Bartender'],
    intro: "The opening bartender completes every task below before service begins and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      T('Place Bar Mats on the Counter'),
      T('Set Up Bar Equipment', 'Jiggers, shaker tins, stirring spoons, mixing beaker, strainers.'),
      T('Stock Juices', 'Lemon, lime, cranberry, pineapple. Make sure every bottle is labeled with the name and date.'),
      T('Stock Syrups / Mixers', 'Demerara, simple, lemon oleo, orgeat, raspberry, peach. Make sure every bottle is labeled with the name and date.'),
      T('Make Salt Air', 'Make sure the frother is working.'),
      T('Stock Garnish Caddy', 'Cherries, lemons, limes, pineapples, and cucumbers.'),
      T('Stock House Wines', '– Chardonnay, Sauvignon Blanc, Moscato, Pinot Grigio, Champagne, Prosecco, Cabernet Sauvignon, Pinot Noir, Merlot, Chianti, and Red Blend — all bottles stocked with labels front-facing.'),
      T('Stock Glassware', '– Cooler stocked with rocks, coupe, Collins, martini, and beer glasses.\n– Fully stock universal wine glasses and champagne flutes.'),
      T('Stock the Beer Cooler', '– When adding bottles, rotate stock so those expiring first sit in front. Front-face the labels of all bottles.'),
      T('Set Your Bar Top', '– One placemat per chair, each with a bread & butter plate and a silverware roll-up.\n– Placemats ½" from the bar top edge; B&B plate centered on every mat; roll-ups all facing the same direction.'),
      T('Prep the Speed Well', 'Uncap all bottles in your speed well and ensure you have adequate amounts of well liquor / specialty cocktail ingredients.'),
      T('Stock the Napkin Caddy', 'Logo napkins and straws for cocktails.'),
      T('Stock Other Garnishes / Products', '– Bitters – Banana chips – Espresso beans – Wood chips – Lemons/oranges for pithing – Eggs – Espresso – Big ice rocks'),
      T('Fully Stock Ice Well'),
      T('Ready the Dining Area', '– All tables properly set, nothing missing.\n– All oil and vinegar bottles full.\n– Floor clean and free of debris.'),
      T('Turn All Lights On', '– Rope lights underneath bar – Cooler lights – Upper shelf lights (switch between coolers)'),
      T('Turn On Music & TVs', '– If there\'s an MSU game, play it on several TVs; set all other TVs to appropriate sports channels.\n– Music mid-40s to low-50s for dining areas; halls low-to-mid-50s.'),
      T('Stock Mise en Place Shelves', '– Top: B&B plates and rocks glasses for table setting.\n– Second: mise en place trays for spoons, steak knives, salt and pepper grinders.\n– Third: freshly-lined trays and a silverware tub with extra salad forks, entrée forks, butter knives, steak knives.\n– Last: back-up straws etc. — nothing that goes straight to the guest\'s table.'),
      T('Stage Rags & Sanitizer', 'Grab fresh rags and check that you have sanitizer spray stored behind the bar.'),
      T('Make a Bowl of Grated Parmesan'),
      T('Tidy the Back Counter', 'Make sure it looks presentable — remove any unnecessary items to avoid a cluttered look.'),
      T('Prep Low/Out Syrups & Garnishes', '– Simple syrup, demerara syrup, lemon oleo, salt air, butterfly pea tea, sliced cucumbers, wedge lemons, wedge limes, sangrias.'),
      T('Check Presenters', 'Make sure all check presenters are in great condition and have paperclips.'),
      T('Notify Manager of Low Stock', "Look through stock and notify the manager on duty if you're low on or out of anything behind the bar."),
      T('Make Back-Up Roll-Ups', 'For resetting.'),
      T('Count Bar Bank', 'Put the counted bank in the cash drawer.'),
    ],
  },
  {
    id: 'veranda-opening', kind: 'opening', title: 'Veranda Opening Checklist', subtitle: 'Veranda Bar — Pre-Shift Setup & Readiness',
    workers: ['Bartender'],
    intro: "The opening bartender completes every task below before service begins and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      T('Place Bar Mats on the Counter'),
      T('Set Up Bar Equipment', 'Jiggers, shaker tins, stirring spoons, mixing beaker, strainers.'),
      T('Stock Juices', 'Lemon, lime, cranberry, pineapple.'),
      T('Stock Syrups / Mixers', 'Demerara, simple, lemon oleo, orgeat, raspberry, peach.'),
      T('Make Salt Air', 'Make sure the frother is working.'),
      T('Stock Garnish Caddy', 'Mint, cherries, lemons, limes, pineapples, and cucumbers.'),
      T('Stock House Wines', '– At least one bottle of each: Chardonnay, Sauvignon Blanc, Moscato, Pinot Grigio, Champagne, Prosecco, Cabernet Sauvignon, Pinot Noir, Merlot, Chianti, and Red Blend.'),
      T('Stock Glassware', '– Cooler stocked with coupe glasses, rocks glasses, and Collins glasses.\n– Also keep some universal wine glasses on hand.'),
      T('Stock the Beer Cooler', '– When adding bottles, rotate stock so those expiring first sit in front.'),
      T('Set Your Bar Top', '– One placemat per chair, each with a bread & butter plate and a silverware roll-up.'),
      T('Prep the Speed Well', 'Uncap all bottles in your speed well and ensure you have adequate amounts of well liquor / specialty cocktail ingredients.'),
      T('Stock the Napkin Caddy', 'Logo napkins and straws for cocktails.'),
      T('Stock Other Garnishes / Products', '– Bitters – Banana chips – Espresso beans – Wood chips'),
      T('Fully Stock Ice Well'),
      T('Ready the Dining Area', '– Check that all tables are properly set.\n– Ensure the floor is clean and free of debris.\n– Set up the patio if it\'s being used.\n– Check with the manager on duty on whether the garage door(s) should be open.'),
      T('Turn All Lights On', '– All floor lamps – Rope lights underneath the bar – Overhead light – Outside lights over the 400s – Patio string lights, if being used'),
      T('Clean the Garage Door Windows', 'Using Windex and a microfiber cloth.'),
      T('Turn On TVs for Game Day', "– If there's an MSU game, make sure it's playing on both TVs.\n– Whether the TVs are on is up to the manager on duty."),
      T('Stage Rags & Sanitizer', 'Grab fresh rags and check that you have sanitizer spray stored behind the bar.'),
      T('Make a Bowl of Grated Parmesan'),
      T('Tidy the Bar Coolers', 'Make sure the cooler surfaces behind the bar look presentable — remove any unnecessary items.'),
    ],
  },
  {
    id: 'host-closing', kind: 'closing', title: 'Host Closing Checklist', subtitle: 'Front of House — Closing Duties & Guest Handoff',
    workers: ['Host'],
    intro: "The closing host completes every task below before leaving and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      T('Pass Along Manager Notes', 'Give any notes regarding reservations/requests to the manager on duty for the General Manager or Assistant Manager to handle promptly.'),
      T('Report Low or Out-of-Stock Supplies', '– Ex. call logbook, mints, Windex, sanitizer spray, wobble wedges, pens, scratch paper, menus.'),
      T('Gather & Sanitize Menus', 'Gather all cocktail menus, food menus, and wine books from anywhere in the restaurant. Sanitize and dry every menu before storing them under the counter, and set out Lunch menus for the next day (check with the manager before special days like MSU graduation or Mother\'s Day).'),
      T('Clean the Countertop', 'Remove everything you can from the countertop, then use sanitizer and a rag to clean the surface.'),
      T('Restock Mints'),
      T('Check Business Cards', 'Let the manager on duty know if business cards need to be replenished.'),
      T('Close Out the iPads', '– Clear all tables and server assignments, unless still busy — then check with the manager.\n– Clear all open apps; charge the iPad with the lowest battery.\n– Store both iPads under the counter, unless the manager wants one.'),
      T('Sweep the Rugs', '– Sweep the rug in front of the host stand and the rug inside the front door.'),
      T('Sweep Foyer / Front Hallway', '– Sweep thoroughly in the foyer, including behind the propped doors, to the Main Dining Room entrance.'),
      T('Take Out the Trash', 'Take the trash out and replace the bag. Throw away any disposable drink cups left from the day.'),
      T('Turn In Lost & Found Items', 'Turn in items left by guests to the manager on duty, with where the guest was seated, a reservation name if possible, and any identifying information.'),
      T('Turn In Gift Card Receipts / Cash', 'Turn in any gift card receipts and/or cash to the manager on duty, and run a checkout report if you have receipts.'),
      T('Check Out With the Manager', 'Always check out with the manager on duty before leaving.'),
    ],
  },
  {
    id: 'server-closing', kind: 'closing', title: 'Server / Food Runner Closing Checklist', subtitle: 'Taste Italian Kitchen · Front of House',
    workers: ['Server / Food Runner'], sections: true,
    intro: 'Complete each task in your assigned section before clocking out and initial the box once it is done.',
    tasks: [
      T('Bread Warmer', 'Turn off the warmer. Wrap unsliced half loaves, date them and store in the walk-in. Sanitize and scrub all stainless surfaces and the interior.', { section: 'Food Runner' }),
      T('Break down your drink station', 'Fill a sixth pan with sanitizer. Remove nozzles from the soda lines, wipe each one down, and let them soak in the pan overnight.', { section: '19-23' }),
      T('Drink Station Ice', 'Stock ice to 100% in the drink station bin. (On Sundays, empty and sanitize the bin at closing.)', { section: '19-23' }),
      T('Water Bottle Cooler', 'Remove the water bottles; sanitize the stainless and wire rack; clean both sides of the glass door with Windex; return the bottles.'),
      T('Clean tea urns and tea machine', 'Wipe the machine; empty, scrub (hot water and Pot & Pan detergent) and rinse the urns, paying extra attention to the spout; take the nozzles apart, scrub and soak them with the drink nozzles; clean and dry the decanter; wipe the panel above the urns.', { section: '10-12, 16' }),
      T('Clean the cotton candy machine / surrounding area', 'Machine off first. Spray off the dome; unlatch the bowl, spray and run it through the dishwasher; sanitize the spinner and all sides; clean the cabinet doors, back wall and counters of all sugar; dry and reattach the bowl.', { section: '1-6' }),
      T('Clean coffee machine / pots', 'Empty and clean the grounds tray and drip tray; sanitize every surface including the top; restock coffee and powders.', { section: '10-12, 16' }),
      T('Sweep section', 'Pull all chairs out and sweep under each table, then the surrounding areas and your serving pathway.', { section: 'All' }),
      T('Clean the vent beside the dish area', 'Use a rag and sanitizer spray to remove any dirt/food/dust from the vent.', { section: '10-12, 16' }),
      T('Fill oil and vinegar bottles', 'Wipe the bottles so they are not oily/dirty, and ensure the spouts are covered.', { section: 'All' }),
      T('Polish all silverware and glassware', 'Return polished items to their areas: wine, Collins, coupe and most rocks glasses to the bar; some rocks glasses to the server station; silverware to mise en place trays then the grey holders; upper-tier wine glasses to the server station racks; spread extra B&B plates and oil dishes between bar, main dining and Veranda.', { section: 'All' }),
      T('Clean server station', 'Clean the lower shelf and countertop with sanitizer; empty and rinse the trash bucket; take soiled rags to the linen bags.', { section: '13-15, 18' }),
      T('Restock server station', 'Two mise en place trays (steak knives and entrée forks; soup, dessert and twirling spoons). Stock rocks glasses, B&B plates and oil dishes.', { section: '13-15, 18' }),
      T('Fold linens', 'Fill the bins under the server station; fill every empty bread basket, plus 30 extra for "hot hands".', { section: 'All' }),
      T('Clean all POS screens in the Veranda and at the server station', 'Do not directly spray the screens.', { section: '13-15, 18' }),
      T('Take out any broken glass', 'Take the broken-glass bucket out and empty it directly into the dumpster.', { section: '13-15, 18' }),
      T('Sweep all rugs', 'Rugs completely free of debris; fold in half top-to-top, roll, and store in nearby corners so the floors can be mopped. Clean out the dustpan(s).', { section: '19-23' }),
      T('Ice Well Items', 'Wrap and put away the lemons, heavy whipping cream and butter chips from the ice well by the cotton candy machine.', { section: '19-23' }),
      T('Wipe down the entire server counter space in the kitchen', 'Throw away any trash; sanitize from the kitchen POS to the bread warmer, then from the napkins/straws/tea to the cotton candy machine.', { section: '1-6' }),
      T('Restock all to-go items in the kitchen under the water station', 'Logo cups and lids, Styrofoam cups and lids, 2 oz cups and lids, small and large clamshells, 16 oz soup bowls and lids, and logo bags.', { section: '1-6' }),
    ],
  },
  {
    id: 'bar-closing', kind: 'closing', title: 'Bar Closing Checklist', subtitle: 'Beverage Program — End-of-Night Bar Close-Out',
    workers: ['Bartender'],
    intro: "The closing bartender completes every task below before leaving and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      T('Sanitize Bar Equipment', 'Fill a sink with hot water and a sanitizer tablet. Clean jiggers, shaker tins, stirring spoons, mixing beakers and strainers with a rag and the solution.'),
      T('Clean Bar Mats', 'Remove all bar mats from the bar top and clean using the sanitizer solution.'),
      T('Clean the 3-Compartment Sink', 'Once equipment is clean and set to dry, clean all stainless steel surfaces using Q&A Sanitizer solution.'),
      T('Burn & Sanitize the Ice Well', 'Burn the ice in the ice well, then sanitize. Rinse with hot water to remove any residue.'),
      T('Clean the Speed Wells', '– Remove all bottles, clean with Q&A Sanitizer and a fresh rag — no debris or stickiness.\n– Wipe every bottle as you return it.'),
      T('Cap Speed Well Bottles', '– Cap every bottle in the speed well with a spout cover, and any open bottles on the risers.'),
      T('Cork Open Wine Bottles', 'Ensure all open bottles of wine are properly corked.'),
      T('Deep-Clean the Cooler', 'Clear all product from the cooler; clean the inside with Q&A Sanitizer and a fresh rag, wiping all interior sides.', { day: 0 }),
      T('Wipe Cooler Exterior', 'Clean all accessible exterior surfaces. Do not spray solution directly into the vents.'),
      T('Rotate & Stock Beer', 'Ensure beers are in date and properly rotated, with the newest beer in the back.'),
      T('Stock House Wines', 'Chardonnay, Pinot Grigio, Sauvignon Blanc, Moscato, Champagne, and Prosecco.'),
      T('Stock Glassware', 'Rocks, coupe, Collins, mocktail, and beer glasses.'),
      T('Sweep Your Section', '– Pull chairs out and sweep underneath, push back and sweep around.\n– Sweep behind the bar and in the bar closet.'),
      T('Clean the Vents', "Using a fresh rag and sanitizer spray — including the ones by Coach's table and by the kitchen door."),
      T('Fill Oil & Vinegar Bottles', 'Wipe bottles clean of any oil/residue, and make sure the spouts are covered.'),
      T('Polish Silverware & Glassware', '– Wine, Collins, coupe and most rocks glasses back to the bar; some rocks to the server station; silverware to mise en place trays then the grey holders; upper-tier wine glasses to the server station racks; extra B&B plates and oil dishes spread between bar, main dining and Veranda.'),
      T('Refill Pizza Topping Caddies', 'Grated parmesan, oregano, and red pepper flakes.'),
      T('Restock Silverware Rolls', '20 should be prepared for the next service.'),
      T('Fold Linens', '– Fill the bins under the server station.\n– Fill every empty bread basket, plus 30 extra for "hot hands".'),
      T('Clean the Bar Top', 'Using sanitizer spray, including the ridges where the bar mats sit.'),
      T('Take Out the Trash', 'Take all cans outside; wash each can out with soap and hot water so no food/trash remains in the bottom.'),
      T('Handle Rags & Dirty Linens', "Discard in the kitchen linen bags, or take directly to the outside linen bin if you're the last to leave."),
      T('Replenish Wine Room Sales', 'If you sold any bottles from the wine room, replenish them.'),
      T('Notify Manager of Low Stock', 'Make a list of anything out of stock or low, and notify the manager on duty so orders can be placed.'),
      T('Mop the Bar Area', 'Bar closet, floor behind the bar — including under the wells, sinks, and ice bins — and around the bar to the tile out front.'),
      T('Mop the Entire Bar Area', "From the entrance to the far corner by Coach's Table.", { day: 3 }),
      T('Clean the Risers', 'Remove all bottles, clean risers with sanitizer spray on a fresh rag (never spray the riser directly), and wipe bottles as you return them.', { day: 4 }),
      T('Stock the Bar Closet Shelves', 'Keep shelves fully stocked with house items when possible; stock any full cases in the closet or walk-in before leaving.'),
    ],
  },
  {
    id: 'boh-closing', kind: 'closing', title: 'Kitchen Closing Checklist', subtitle: 'Kitchen Line Close-Out — Daily Task Verification by Station',
    workers: ['Closing Chef', 'Closing Lead'],
    intro: "The closing chef and/or lead completes every task below by station and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    tasks: [
      G('Sauté'), T('Hot Wells Detailed'), T('Stove Top Catch Trays'), T('Drawers and Counters Detailed'), T('Flat Chicken Tray'), T('Pans Flipped'),
      G('Flat'), T('Clean Flat Top (Top & Bottom) & Dump Grease'), T('Wrap Top of Line'), T('Meat Cage Organized'), T('Sweep & Scrub Floors'), T('Take Potatoes Out of Well'), T('Broccoli & Spin Drawer'),
      G('Pizza'), T('Flip Pans'), T('Detail Top of Pizza Oven and White Tiles'), T('Oven Brushed (Fully Cleaned Tuesdays & Thursdays)'), T('Oven Set to 300°'), T('Sweep and Mop Floor'), T('Cutting Board Pressure Washed (Once a Week)'), T('Detail Pizza Bar'),
      G('Fry'), T('Filter Fryers'), T('Wrap Line and Clean'), T('Detail and Clean Prep Area (Sweep & Scrub Floors & Detail Sink)'), T('Hot Box Cleaned and Off'), T('Label Everything & Detail Cooler'), T('Wipe Oven & Turn Both Oven and Fryers Off'), T('Grease Pan Empty'),
      G('Garmo'), T('Clean Cooler Top, Bottom & Inside'), T('Flip Pans and Cover'), T('Label Unlabeled Items in Walk-In'), T('Detail Walk-In Cooler'), T('3-Door Closet Sweep and Mop'), T('Cover Speed Rack'),
      G('Dish'), T('Run All Dishes'), T('Clean Drain Filters & Catch Trays'), T('Scrub All Pots and Pans'), T('Clean Top Dishwasher & ALL Sinks'), T('ALL Trash Taken Out'), T('Wipe Down All Surfaces'), T('Clear Drains of Debris'), T('Sweep & Scrub Floors'),
      G('Final Walkthrough'), T('Food Debris Off Every Line'), T('All Water is Drained'), T('All Rags Taken Out'), T('All Equipment Turned Off'), T('Pans Flipped'),
    ],
  },
  // ---- Taste Ridgeland (sheets from Brenner, 10 Oct 2026) ----
  {
    // Ridgeland's AM sheet, retitled like Starkville's lists (12 Oct 2026).
    // The id stays, so the sheets already filed carry on.
    id: 'ridgeland-chef-opening', kind: 'opening', title: 'Kitchen Opening Checklist', subtitle: 'Kitchen — Pre-Service Setup & Readiness',
    workers: ['Opening Lead', 'Start Time'],
    intro: "The opening kitchen lead completes every task below before service begins and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    notes: [['maintenance', 'Maintenance / Equipment Issues'], ['prep', 'Product / Prep Issues for PM Team'], ['other', 'Additional Notes']],
    tasks: [
      G('1. Kitchen & Equipment Inspection'),
      T('Check all walk-in coolers and confirm they are operating and cooling properly.'),
      T('Check all reach-in coolers and confirm they are operating and cooling properly.'),
      T('Verify all equipment that should have been turned off overnight was turned off.'),
      T('Inspect equipment for visible damage, leaks, unusual temperatures, or other concerns.'),
      T('Report equipment problems to management immediately.'),
      G('2. Dish Area Check'),
      T('Inspect the dish area from the previous night.'),
      T('Confirm clean dishes, utensils, pots, pans, and equipment are stored in their designated locations.'),
      T('Confirm the dish area is clean, organized, and ready for service.'),
      G('3. General Kitchen Cleanliness'),
      T('Inspect kitchen walls; remove any food, grease, dirt, or debris.'),
      T('Confirm kitchen floors were pressure washed and properly cleaned during the previous closing shift.'),
      T('Check corners, under equipment, and other hard-to-reach areas for debris.'),
      T('Confirm the employee smoking area is clean and free of trash and debris.'),
      T('Confirm the back area is free of boxes, trash, food debris, and clutter.'),
      T('Correct or assign all cleaning issues before service begins.'),
      G('4. Delivery / Truck Receiving'),
      T('Assist cooks with receiving and putting away truck deliveries.'),
      T('Store refrigerated and frozen products promptly.'),
      T('Place all products in the correct storage areas and follow FIFO rotation.'),
      T('Notify management of missing, damaged, incorrect, or questionable products.'),
      G('5. Station Opening Support'),
      T('Check in with each cook about station setup.'),
      T('Assist any cook who needs help opening or preparing a station.'),
      T('Confirm each station has required food, utensils, cutting boards, smallwares, towels, and sanitizer.'),
      T('Confirm all stations are fully set and ready before service.'),
      G('6. AM/PM Prep Review'),
      T('Meet with the AM Lead Prep Cook and review the AM and PM prep lists.'),
      T('Identify high-priority and low-stock items; adjust prep priorities as needed.'),
      T('Verify prep quantities will support lunch and dinner service.'),
      G('7. Daily Par Levels'),
      T("Review the previous day's sales and current product on hand."),
      T('Review OpenTable reservations, large parties, special events, and catering orders.'),
      T('Set food and prep pars based on projected sales and expected business.'),
      T('Communicate adjusted pars to prep cooks, lead cooks, and appropriate kitchen staff.'),
      G('8. Morning Catering'),
      T('Review all catering orders scheduled for the morning.'),
      T('Verify quantities, pickup or delivery times, and special instructions.'),
      T('Assist with catering preparation as needed.'),
      T('Confirm all catering food is complete, packaged, and ready on time.'),
      G('9. Labor Review'),
      T('Review the kitchen schedule for the entire day.'),
      T('Compare scheduled labor with reservations, catering, projected business, and expected sales.'),
      T('Reduce labor only when service and preparation will not be negatively affected.'),
      T('Make labor adjustments early and communicate changes to employees and management.'),
      G('10. Final Opening Walk-Through'),
      T('Kitchen is clean, organized, and ready for service.'),
      T('Coolers and other required equipment are operating properly.'),
      T('Prep is on schedule and all stations are completely set.'),
      T('Catering needs are covered and staffing has been reviewed.'),
      T("Team knows about reservations, large parties, specials, 86'd items, catering, and service concerns."),
    ],
  },
  {
    id: 'ridgeland-chef-closing', kind: 'closing', title: 'Kitchen Closing Checklist', subtitle: 'Kitchen — End-of-Night Close-Out',
    workers: ['Closing Lead', 'Start Time'],
    intro: "The closing kitchen lead completes every task below before leaving and initials the box once it's verified. Let the manager on duty know right away if anything below can't be completed.",
    notes: [['maintenance', 'Maintenance / Equipment Issues'], ['prep', 'Product / Prep Issues for AM Team']],
    tasks: [
      G('1. Food Storage, Labeling & Dating'),
      T("Inspect every cook's station before the employee leaves."),
      T('Confirm all remaining food is covered or placed in approved storage containers.'),
      T('Confirm all stored food is clearly labeled and dated.'),
      T('Return food to the correct walk-in, reach-in, freezer, or dry-storage location.'),
      T('Maintain FIFO rotation and discard food that cannot be safely stored or does not meet standards.'),
      G('2. Food Cooling'),
      T('Check sauces, soups, proteins, pasta preparations, and all other cooked foods requiring cooling.'),
      T('Transfer hot food to appropriate containers or pans for safe cooling.'),
      T('Do not leave food in large or deep containers that prevent proper cooling.'),
      T('Verify refrigerated food is cooling properly before final storage.'),
      T('Cover, label, date, and store all cooled food properly.'),
      G('3. Cooler Check'),
      T('Check all walk-in and reach-in coolers.'),
      T('Confirm all coolers are operating and cooling properly.'),
      T('Confirm cooler doors are completely closed and food is organized correctly.'),
      T('Report temperature, equipment, or cooling concerns immediately.'),
      G('4. Kitchen Equipment'),
      T('Confirm cooking equipment is thoroughly cleaned and free of grease, food debris, and residue.'),
      T('Turn off all kitchen equipment required to be shut down overnight.'),
      T('Verify burners, ovens, fryers, grills, sauté equipment, warmers, and other applicable equipment are off.'),
      T('Report equipment malfunctions or maintenance issues before leaving.'),
      G('5. Cutting Boards & Stations'),
      T('Remove all cutting boards from every station.'),
      T('Scrub and sanitize/bleach cutting boards according to food-safety procedures.'),
      T('Wipe down and sanitize each station; remove all food debris.'),
      T('Clean and properly store station utensils and smallwares.'),
      G('6. Dish Area'),
      T('Confirm all dishes, pots, pans, utensils, containers, and smallwares are washed and properly stored.'),
      T('Clean and sanitize all hand sinks and dish sinks.'),
      T('Completely clean the dish machine.'),
      T('Clean and polish applicable stainless-steel surfaces.'),
      T('Leave the dish area clean, dry, and organized.'),
      G('7. Pizza Area'),
      T('Check and fully restock pizza boxes and packaging supplies.'),
      T('Leave the pizza area clean, organized, and ready for the next shift.'),
      G('8. Trash'),
      T('Empty all kitchen trash cans and move trash to the proper disposal area.'),
      T('Place a clean liner in every trash can.'),
      T('Leave the trash area clean and free of loose debris.'),
      G('9. Floors'),
      T('Thoroughly clean kitchen floors, including under accessible equipment and around station edges.'),
      T('Remove all food, grease, trash, and debris.'),
      T('Leave no puddles or standing water on the floor.'),
      T('Confirm floors are as dry as possible before closing.'),
      G('10. Final Closing Walk-Through'),
      T('All food is safely stored, labeled, dated, and cooling properly.'),
      T('All coolers are operating properly and doors are closed.'),
      T('Dishes are washed and stored; cutting boards are scrubbed and sanitized.'),
      T('Trash is removed, cans have new liners, and pizza boxes are stocked.'),
      T('Equipment is clean and required equipment is turned off.'),
      T('Hand sinks, dish sinks, dish machine, and stainless-steel surfaces are clean.'),
      T('Floors are clean and dry with no standing water.'),
      T('Kitchen is organized and ready for the AM opening team.'),
    ],
  },
];

// ---- Taste Ridgeland front of house (Brenner, 12 Oct 2026) ----
// Ridgeland's own sheets are kitchen-only, so its front of house runs
// Starkville's lists: the Veranda is Ridgeland's Terrazza, Starkville's table
// sections go, and anything that only makes sense in Starkville's building is
// reworded or dropped below. Ridgeland's managers check them against the room.
//
// edits: { 'Task title': 'new details' | null (drop the task) }
function forRidgeland(fromId, id, { title, subtitle, edits = {} } = {}) {
  const from = DAILY_CHECKLISTS.find((l) => l.id === fromId);
  const swap = (text) => (typeof text === 'string' ? text.replace(/Veranda/g, 'Terrazza') : text);
  const tasks = from.tasks
    .filter((t) => t.group || edits[t.title] !== null)
    .map((t) => {
      if (t.group) return t;
      const { section, ...rest } = t;
      return { ...rest, title: swap(t.title), details: swap(t.title in edits ? edits[t.title] : t.details) };
    });
  return { ...from, id, title: title ?? swap(from.title), subtitle: swap(subtitle ?? from.subtitle), intro: swap(from.intro), sections: false, tasks };
}

DAILY_CHECKLISTS.push(
  forRidgeland('host-opening', 'ridgeland-host-opening', {
    edits: {
      'Turn On Lights': 'Turn on the host stand and entry lights.',
      'Roll Out Rugs': 'Logo mat at the front door, readable as guests walk in, and a runner at the host stand. Vacuum or sweep every rug clean before opening.',
      'Sweep Foyer / Front Hallway': 'Sweep the entry thoroughly, including behind any doors propped open through service.',
      'Clean Windows & Doors': 'Using Windex and a microfiber cloth: the front doors, the entry windows, and the Terrazza windows and doors.',
    },
  }),
  forRidgeland('server-opening', 'ridgeland-server-opening', {
    edits: {
      'Bread Warmer': 'Turn the bread warmer on. Check the walk-in for bread from the previous night before opening fresh loaves. Slice loaves in half and store them in the warmer. Do not cut bread into serving slices until 10:45 AM or later. Once slicing, put a damp rag in an eighth pan in the bottom tray to keep the bread from drying out.',
      'Roll out rugs': 'Roll out every runner and logo mat in its usual place: kitchen hallway, Terrazza doors, server station, and front entrance.',
      'Set up parmesan bowls': 'Use the grated Parmesan in the walk-in — look for an open bag before opening a new one. Bowls for each server station, with spoons.',
      'Refrigeration Well': 'Set up the refrigeration well for lemons, butter chips and heavy cream by filling it about 1/3 of the way with ice.',
    },
  }),
  forRidgeland('bar-opening', 'ridgeland-bar-opening', {
    edits: {
      'Turn All Lights On': 'Every bar light: under-bar lights, cooler lights, and shelf lights.',
      'Turn On Music & TVs': "– If there's a big game, check with the manager on duty about which TVs show it; set all other TVs to appropriate sports channels.\n– Music mid-40s to low-50s for dining areas; halls low-to-mid-50s.",
    },
  }),
  forRidgeland('veranda-opening', 'ridgeland-terrazza-opening', {
    title: 'Terrazza Opening Checklist',
    subtitle: 'Terrazza — Pre-Shift Setup & Readiness',
    edits: {
      'Ready the Dining Area': "– Check that all tables are properly set.\n– Ensure the floor is clean and free of debris.\n– Set up the patio if it's being used.",
      'Turn All Lights On': '– Every Terrazza light, inside and out, including any string lights if the patio is being used.',
      'Clean the Garage Door Windows': null,
      'Turn On TVs for Game Day': "– If there's a big game, check with the manager on duty about the TVs.",
    },
  }),
  forRidgeland('host-closing', 'ridgeland-host-closing', {
    edits: {
      'Gather & Sanitize Menus': "Gather all cocktail menus, food menus, and wine books from anywhere in the restaurant. Sanitize and dry every menu before storing them, and set out Lunch menus for the next day (check with the manager before special days like graduations or Mother's Day).",
      'Close Out the iPads': '– Clear all tables and server assignments, unless still busy — then check with the manager.\n– Clear all open apps; charge the iPad with the lowest battery.\n– Store the iPads at the host stand, unless the manager wants one.',
      'Sweep the Rugs': '– Sweep the rug at the host stand and the rug inside the front door.',
      'Sweep Foyer / Front Hallway': '– Sweep the entry thoroughly, including behind any propped doors.',
    },
  }),
  forRidgeland('server-closing', 'ridgeland-server-closing', {
    edits: {
      'Bread Warmer': 'Turn off the warmer. Wrap unsliced half loaves, date them and store in the walk-in. Sanitize and scrub all stainless surfaces and the interior.',
      'Clean the cotton candy machine / surrounding area': null,
      'Clean the vent beside the dish area': 'Use a rag and sanitizer spray to remove any dirt/food/dust from the vents near the dish area.',
      'Polish all silverware and glassware': 'Return polished items to their areas: bar glassware to the bar, rocks glasses to the server station, silverware to mise en place trays then the holders; spread extra B&B plates and oil dishes between the bar, the dining room and the Terrazza.',
      'Ice Well Items': 'Wrap and put away the lemons, heavy whipping cream and butter chips from the ice well.',
      'Wipe down the entire server counter space in the kitchen': 'Throw away any trash and sanitize the whole server counter in the kitchen, from the POS to the bread warmer and the drink area.',
      'Restock all to-go items in the kitchen under the water station': 'Logo cups and lids, Styrofoam cups and lids, 2 oz cups and lids, small and large clamshells, 16 oz soup bowls and lids, and logo bags.',
    },
  }),
  forRidgeland('bar-closing', 'ridgeland-bar-closing', {
    edits: {
      'Clean the Vents': 'Using a fresh rag and sanitizer spray, every vent in the bar area.',
      'Polish Silverware & Glassware': '– Bar glassware back to the bar; rocks glasses to the server station; silverware to mise en place trays then the holders; extra B&B plates and oil dishes spread between the bar, the dining room and the Terrazza.',
      'Mop the Entire Bar Area': 'From the entrance to the far corner of the bar area.',
    },
  }),
);

// Ridgeland's AI devices (Brenner, 14 Oct 2026): the manager on duty hands
// them out and checks they are on at opening, and collects them, turns them
// off and plugs each one into its spot at closing.
DAILY_CHECKLISTS.push(
  {
    id: 'ridgeland-manager-opening', kind: 'opening', title: 'Manager Opening Checklist', subtitle: 'Manager on Duty — Pre-Shift',
    workers: ['Manager on duty'],
    intro: "The opening manager completes every task below before service begins and initials the box once it's done.",
    tasks: [
      G('AI devices'),
      T('Assign the AI devices', 'Hand a device to each team member who wears one today, and note who has which.'),
      T('Make sure every device is on', 'Check each device is powered on and working before service starts.'),
    ],
  },
  {
    id: 'ridgeland-manager-closing', kind: 'closing', title: 'Manager Closing Checklist', subtitle: 'Manager on Duty — End of Night',
    workers: ['Manager on duty'],
    intro: "The closing manager completes every task below before leaving and initials the box once it's done.",
    tasks: [
      G('AI devices'),
      T('Collect every AI device', 'Get each device back from the team member who had it. Every one is accounted for.'),
      T('Turn the devices off'),
      T('Plug each device into its spot', 'Back in its own charging spot, so it is charged for tomorrow.'),
    ],
  },
);

// Starkville's Kitchen Opening (Brenner, 14 Oct 2026): the AM chef sheet
// Ridgeland uses, as its own list so each location's records stay separate.
DAILY_CHECKLISTS.push({ ...DAILY_CHECKLISTS.find((l) => l.id === 'ridgeland-chef-opening'), id: 'kitchen-opening' });

// The lists one location runs, in its order.
export const listsFor = (locationId) =>
  (LISTS_AT[locationId] ?? []).map((id) => DAILY_CHECKLISTS.find((l) => l.id === id)).filter(Boolean);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (d) => DAY_NAMES[d];

// The tasks for one list on one date - day-specific tasks only on their day.
export function tasksFor(list, dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return list.tasks.filter((t) => t.day === undefined || t.day === weekday);
}
