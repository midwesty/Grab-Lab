Grab Lab patch - map controls, traversal traits, clustered map, resource grabbing

Replace/add these files in your project:
- index.html
- style.css
- js/world.js
- js/input.js
- js/map.js
- js/crafting.js
- js/breeding.js
- js/party-control.js  (new file)

Important:
- I did NOT include ui.js in this ZIP because the uploaded ui.js copy in this chat appears to contain index.html content, not UI JavaScript. The new party-control.js file patches the Party modal without replacing your working ui.js.
- index.html now references js/party-control.js and uses version query strings on scripts to help GitHub Pages/Chrome avoid stale cache.

Test focus:
1. Main map zoom buttons, arrow-pan buttons, recenter button, label toggle, boat toggle.
2. Click-hold-drag on the main world to pan the camera.
3. Click a far visible POI and make sure selection still works.
4. Select plants/algae/fungus resources and use Grab to collect them.
5. Open Party and use the new Controlled Character panel to play as You/Marsy/other active animals.
6. Try water/deep water/high/canopy/cliff/cave tiles with and without traits like Swim/Gills/Flight/Claws.
7. Breed animals and confirm movement traits can pass to offspring.
8. Confirm rope/trap/net/passive line craft recipes exist even if they were missing from JSON.
