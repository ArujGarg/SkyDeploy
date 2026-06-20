// import { getAvailablePort } from "./utils/port.util.js";

// const port = await getAvailablePort();

// console.log("Allocated port:", port);

import { getExposedPort } from "./services/docker.service.js";

const port = await getExposedPort("skydeploy:cmqmklrl40000cyr3i5ejnz77");

console.log(port);
