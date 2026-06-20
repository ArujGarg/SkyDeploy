import net from "net";

const PORT_RANGE_START = 10000;
const PORT_RANGE_END = 20000;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

export async function getAvailablePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const available = await isPortAvailable(port);

    if (available) {
      return port;
    }
  }

  throw new Error("No available ports found");
}
