/**
 * View all cached data - run from Apps Script editor
 */
function viewCache() {
  const cache = CacheService.getScriptCache();
  
  // Get batch metadata
  console.log('=== BATCH METADATA ===');
  const metadata = cache.get('batch_metadata');
  if (metadata) {
    const meta = JSON.parse(metadata);
    console.log(`Last Run: ${meta.lastRun}`);
    console.log(`Duration: ${meta.duration} min`);
    console.log(`People: ${meta.peopleProcessed}`);
    console.log(`Events: ${meta.eventsFound}`);
    console.log(`Cache Size: ${meta.cacheSizeMB} MB`);
  } else {
    console.log('No batch metadata found');
  }
  
  // Get cached people
  console.log('\n=== CACHED PEOPLE ===');
  const peopleJson = cache.get('batch_people_list');
  if (peopleJson) {
    const people = JSON.parse(peopleJson);
    console.log(`Total cached: ${people.length} people\n`);
    
    let totalEvents = 0;
    people.forEach(name => {
      const personCache = cache.get(`schedule_${name}`);
      if (personCache) {
        const data = JSON.parse(personCache);
        const eventCount = data.events ? data.events.length : 0;
        totalEvents += eventCount;
        console.log(`${name}: ${eventCount} events`);
      }
    });
    
    console.log(`\nTotal events in cache: ${totalEvents}`);
  } else {
    console.log('No people list found');
  }
}

/**
 * View specific person's cached schedule
 * @param {string} name - Person's name (e.g., "Sick")
 */
function viewPersonCache(name = "Sick") {
  const cache = CacheService.getScriptCache();
  const personCache = cache.get(`schedule_${name}`);
  
  if (!personCache) {
    console.log(`No cache found for "${name}"`);
    return;
  }
  
  const data = JSON.parse(personCache);
  console.log(`=== CACHE FOR: ${name} ===`);
  console.log(`Class: ${data.class}`);
  console.log(`Type: ${data.type}`);
  console.log(`Last Updated: ${data.lastUpdated}`);
  console.log(`Days: ${data.days ? data.days.join(', ') : 'None'}`);
  console.log(`Events: ${data.events ? data.events.length : 0}`);
  
  if (data.events && data.events.length > 0) {
    console.log('\n--- Events ---');
    data.events.forEach((evt, i) => {
      console.log(`${i+1}. ${evt.date} ${evt.time || ''} - ${evt.type}: ${evt.description.substring(0, 60)}`);
    });
  }
  
  console.log('\n--- Full JSON ---');
  console.log(JSON.stringify(data, null, 2));
}
