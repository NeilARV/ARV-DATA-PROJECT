export async function fetchCounty(longitude: number, latitude: number) {

    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

    const response = await fetch(url);
    
    const data = await response.json();

    return data.result.geographies.Counties[0].BASENAME;

}