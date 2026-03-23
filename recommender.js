function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position){
      console.log(position);
      showNearbyRestaurants(position)
    }
    );
  } else {
    console.log("Geolocation not supported");
  }
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
function showNearbyRestaurants(position) {

  const userLat = position.coords.latitude;
  const userLon = position.coords.longitude;

  const results = restaurants.map(r => {
    const distance = getDistance(userLat, userLon, r.lat, r.lon);

    return {
      name: r.name,
      distance: distance
    };
  });

  results.sort((a, b) => a.distance - b.distance);

  const nearest = results.slice(0, 5);

  console.log("Nearest Restaurants:", nearest);
}
getUserLocation();