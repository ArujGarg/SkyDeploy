export async function waitForHealthCheck(
  hostPort: number,
  timeoutMs = 30000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${hostPort}`);

      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return false;
}
