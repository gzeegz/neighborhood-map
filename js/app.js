// Constructor for our place objects. Data comes from a JSON request to the
// Foursquare API.
var place = function(data) {
  var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  this.name = data.venue.name;
  this.location = {
    lat: data.venue.location.lat,
    lng: data.venue.location.lng
  };
  this.category = data.venue.categories[0].shortName;
  this.formattedAddress = data.venue.location.formattedAddress;
  this.rating = data.venue.rating;
  this.ratingColor = data.venue.ratingColor;
  // Add price tier only if the place has a price.
  if (data.venue.hasOwnProperty('price')) {
    var currency = data.venue.price.currency;
    var tier = data.venue.price.tier;
    // Price tier is indicated by number of repeated currency symbols.
    // For example, "$$$$" is very expensive.
    for (var price = currency; price.length <= tier; price += currency) {
      this.price = price;
    }
  } else {
    this.price = null;
  }
  // Add tips only if the place has a tip.
  if (data.hasOwnProperty('tips')) {
    this.tips = data.tips[0];
    this.tips.url = this.tips.canonicalUrl;
    // Create readable date string from number of seconds from Unix Epoch.
    var date = new Date(this.tips.createdAt * 1000);
    this.tips.createdAt = monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  } else {
    this.tips = null;
  }
};


var ViewModel = function() {
  var self = this;
  // Icons for markers on the map.
  var defaultIcon = 'img/red-dot.png';
  var highlightedIcon = 'img/green-dot.png';
  // Keep track of what marker was selected, so it's color can be changed back
  // to the default when a different marker is selected.
  var selectedMarker;

  self.location = ko.observable(Model.meta.geocode.displayString);
  self.placeList = ko.observableArray(createPlaceList(Model.results));

  // Create a place for each object.
  function createPlaceList(placeArray) {
    return placeArray.map(function(placeObj, i) {
      var placeItem = new place(placeObj);
      // Add an id so we can refer to its corresponding marker later. The
      // corresponding marker will have the same id, and its position in the
      // markers array will be the same as id.
      placeItem.id = i;
      return placeItem;
    });
  }

  // There can be at most two infowindows open at a time. One that was opened
  // by a click on a marker. The other one will be opened by hovering over a
  // marker.
  self.infowindow = new google.maps.InfoWindow();
  self.hoverInfowindow = new google.maps.InfoWindow();
  // Markers are updated everytime our placeList changes.
  self.markers = ko.computed(function() {
    return createMarkers(self.placeList());
  });

  self.infowindowContent = ko.observable('');

  // Create markers from an array of places.
  function createMarkers(placeList) {
    var markers = placeList.map(function(placeItem, i) {
      var marker = new google.maps.Marker({
        map: map,
        position: placeItem.location,
        icon: defaultIcon,
        // id used to map places to markers.
        id: i
      });
      // Highlight the marker, and scroll list to show corresponding place.
      marker.addListener('click', function(e) {
        highlightMarker(this, self.infowindow);
        self.showListItem(this.id);
      });
      // Show infoWindow on hover. Don't if marker has been clicked.
      marker.addListener('mouseover', function() {
        if (self.infowindow.marker != this) {
          populateInfoWindow(this, self.hoverInfowindow);
        }
      });
      marker.addListener('mouseout', function() {
        self.hoverInfowindow.close();
      });

      return marker;
    });

    // Extend map bounds to fit all of the markers
    var bounds = new google.maps.LatLngBounds();
    markers.forEach(function(marker) {
      bounds.extend(marker.position);
    });
    map.fitBounds(bounds);

    return markers;
  }

  // Highlight the marker with an infoWindow and an icon change.
  function highlightMarker(marker, infowindow) {
    // Create the contents of the infoWindow.
    populateInfoWindow(marker, infowindow);
    // Highlight only the marker that was clicked.
    // Change previous icon back to default icon.
    if (selectedMarker) {
      selectedMarker.setIcon(defaultIcon);
    }
    marker.setIcon(highlightedIcon);
    selectedMarker = marker;
  }

  // Puts information from the marker's corresponding place into the infoWindow.
  function populateInfoWindow(marker, infowindow) {
    // Check to make sure the marker's infoWindow is not opened already.
    if (infowindow.marker != marker) {
      infowindow.marker = marker;
      // Create the HTML that goes inside the infoWindow.
      var placeItem = self.placeList()[marker.id];
      var content = '';
      content += '<h4 class="place-name">' + placeItem.name + '</h4>';
      content += '<p class="place-category">' + placeItem.category;
      if (placeItem.price) {
        content += ' • ' + placeItem.price;
      }
      content += '</p>';
      content += '<p class="place-address">' + placeItem.formattedAddress[0] + '<br>';
      content += placeItem.formattedAddress[1] + '</p>';
      infowindow.setContent(content);
      // Open the infoWindow.
      infowindow.open(map, marker);
      // If infoWindow is closed, clear marker property.
      // Change the marker's icon back to the default icon.
      infowindow.addListener('closeclick', function() {
        infowindow.marker = null;
        marker.setIcon(defaultIcon);
      });
    }
  }

  self.query = ko.observable('');
  // Filter the places based on the query. Returns a filtered array of places
  // that will be used in the list.
  // self.search is run whenever there is query or placeList changes.
  self.search = ko.computed(function() {
    var filteredPlaceList = ko.utils.arrayFilter(self.placeList(), function(placeItem) {
      return placeItem.name.toLowerCase().indexOf(self.query().toLowerCase()) >= 0;
    });
    // Get the filtered places' ids.
    var filteredId = filteredPlaceList.map(function(placeItem) {
      return placeItem.id;
    });
    // Check each marker to see if its place was filtered or not. If the place
    // was not filtered, hide the marker. Otherwise, show the marker.
    // debugger
    self.markers().forEach(function(marker) {
      if (filteredId.indexOf(marker.id) == -1) {
        marker.setMap(null);
      } else {
        marker.setMap(map);
      }
    });

    return filteredPlaceList;
  });

  // showInfoWindow is called when a place is clicked from the list.
  self.showInfoWindow = function(clickedPlace) {
    var marker = self.markers()[this.id];
    highlightMarker(marker, self.infowindow);
  };
  // Scroll to an item in the list
  self.showListItem = function(id) {
    document.getElementById(id).scrollIntoView({block: "start", behavior: "smooth"});
  };

  // Prepopulate the location input box.
  self.locationInput = ko.observable(Model.api.params.near);
  self.foundLocation = ko.observable();

  // Load a new place based on the location the user submits.
  self.loadPlace = function() {
    // Trim any white space from the location input.
    self.locationInput(self.locationInput().trim());
    // Only load the place if it was not a blank submission.
    if (self.locationInput() !== '') {
      Model.api.params.near = self.locationInput();

      $.getJSON(Model.api.url, Model.api.params, function(data) {
        // Update model
        Model.meta = data.response;
        Model.results = data.response.groups[0].items;
        // Update observables (self.location and self.placeList).
        self.location(Model.meta.geocode.displayString);
        // Hide old markers because new markers will be created when
        // self.placeList changes.
        self.markers().forEach(function(marker) {
          marker.setMap(null);
        });
        self.placeList(createPlaceList(Model.results));

        self.foundLocation(true);
      })
      .fail(function() {
        self.location('Could not find location. Try again.');
        self.foundLocation(false);
      });
    }
  };
};

// Set up the model.
var map;
var Model = {};
Model.api = {
  url: 'https://api.foursquare.com/v2/venues/explore',
  params: {
    'client_id': 'CI3L4FOSVIFWW3KDI31I4OKTUPYQIB2CGK1VYAWENKZSCJJY',
    'client_secret': 'YO4H3E52J2AIFVKPCMPCD0CXPOYY5I4REUZNC204FONRS2UC',
    'near': 'San Francisco',
    'section': 'topPicks',
    'v': '20160801',
    'm': 'foursquare'
  }
};

// The map is rendered first. Then get the JSON object from our API to the
// set up the data. The app view is set up last because it depends on the data.
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 37.77493, lng: -122.419416},
    zoom: 13
  });

  $.getJSON(Model.api.url, Model.api.params, function(data) {
      Model.meta = data.response;
      Model.results = data.response.groups[0].items;

      ko.applyBindings(new ViewModel());
  })
  .fail(function() {
    window.alert('Oops! There was a problem loading the data from Foursquare.');
  });
}
// If Google Maps does not load, then the user is alerted there was an error.
function googleError() {
  window.alert('Oops! There was a problem loading the map from Google Maps.');
}
