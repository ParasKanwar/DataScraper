const fs = require("fs");
const path = require("path");
const rateData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/rateData.json")));
const zoneData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/zoneData.json")));
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/test.json")));
const mapData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/mapData.json")));
const date_for_map_data = "2019-10-08";
const TollCalculator = require("./utils/Final");
const commandLineArgs = require("command-line-args");
const options = [
  { name: "vehicle_type", alias: "v", type: String },
  { name: "directory_path", alias: "d", type: String },
  { name: "from", alias: "f", type: Number },
  { name: "to", alias: "t", type: Number },
  { name: "rate_type", alias: "r", type: String },
];
const args = commandLineArgs(options);
console.log(args);
const { RouteGenerator } = require("./utils/RouteGenerator");
// inititalizing route generator with appropriate map data
RouteGenerator.init(mapData[date_for_map_data], zoneData);
const map_data_for_specific_date = RouteGenerator.generateMapData(testData.date);
const tollCalculator = new TollCalculator(rateData, zoneData);
const locationObj = mapData[date_for_map_data].locations;
const total_locations = Object.keys(locationObj).length;
const { NativeVehicleTypes, NativeTypesToCustom } = require("./constants/vehicalTypes");
const { NativeRateType, NativeToCustomType: NativeToCustomRateType } = require("./constants/rateTypes");
let totalSuccess = 0;
let err_count = 0;
const toSave_Path = path.join(__dirname, "./output.csv");
if (args.directory_path) {
  fs.writeFileSync(toSave_Path, "entrance,exit,time_of_day,vehicle_class,toll_type,toll_rate\n");
  for (let i = 1; i <= total_locations; i++) {
    for (let j = 1; j <= total_locations; j++) {
      for (let vehicleType of NativeVehicleTypes) {
        for (let rateType of NativeRateType) {
          try {
            const route_details_to_feed_into_algorithm = RouteGenerator.generateRoute(map_data_for_specific_date, i, j);
            const result =
              j !== i &&
              tollCalculator.calculate(
                testData.date,
                map_data_for_specific_date,
                route_details_to_feed_into_algorithm,
                vehicleType,
                rateType
              );
            if (result) {
              fs.appendFileSync(
                toSave_Path,
                `${locationObj[i].name},${locationObj[j].name},${NativeToCustomRateType[rateType]},${
                  NativeTypesToCustom[vehicleType]
                },${"Without - Total"},${result.totalAmount[0]}\n`,
                {
                  encoding: "utf-8",
                }
              );
              fs.appendFileSync(
                toSave_Path,
                `${locationObj[i].name},${locationObj[j].name},${NativeToCustomRateType[rateType]},${
                  NativeTypesToCustom[vehicleType]
                },${"With a Transponder - Total"},${result.totalAmount[1]}\n`,
                {
                  encoding: "utf-8",
                }
              );
              totalSuccess++;
            }
          } catch (e) {
            err_count++;
          }
        }
      }
    }
  }
}

try {
  fs.writeFileSync(path.join(__dirname, "./logs.json"), JSON.stringify({ err_count, totalSuccess }));
} catch (e) {
  console.log(e.message);
}
if (args.from && args.to && args.vehicle_type && args.rate_type) {
  const route_details_to_feed_into_algorithm = RouteGenerator.generateRoute(map_data_for_specific_date, args.from, args.to);
  const val = tollCalculator.calculate(
    testData.date,
    map_data_for_specific_date,
    route_details_to_feed_into_algorithm,
    args.vehicle_type,
    args.rate_type
  );
  console.log(val);
}

// const directoryPath = path.join(__dirname, args.directory_path, `${vehicleType}_${rateType}`);
// if (fs.existsSync(directoryPath)) {
//   fs.writeFileSync(
//     path.join(directoryPath, `./${i}_${j}_${vehicleType}_${rateType}.json`),
//     JSON.stringify(result),
//     { encoding: "utf-8" }
//   );
// } else {
//   fs.mkdirSync(directoryPath);
//   fs.writeFileSync(
//     path.join(directoryPath, `./${i}_${j}_${vehicleType}_${rateType}.json`),
//     JSON.stringify(result),
//     { encoding: "utf-8" }
//   );
// }
