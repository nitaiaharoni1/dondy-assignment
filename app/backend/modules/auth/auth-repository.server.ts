import prisma from "../../common/db/db-client.server";

export async function updateSessionScope(
  sessionId: string,
  scope: string,
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { scope },
  });
}
