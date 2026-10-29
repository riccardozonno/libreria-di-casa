import "server-only";
import type { CurrentUser } from "../actor";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { forbidden, notFound } from "../errors";
import { can } from "../policy";

// "Letto da": ognuno segna sé stesso, l'admin chiunque (docs/permissions.md).

export async function setReading(actor: CurrentUser, bookId: string, userId: string, read: boolean): Promise<void> {
  if (!can(actor, { type: "reading.mark", targetUserId: userId })) throw forbidden();

  await prisma.$transaction(async (tx) => {
    const book = await tx.book.findUnique({ where: { id: bookId }, select: { id: true } });
    if (!book) throw notFound("Libro");

    if (read) {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) throw notFound("Utente");
      const created = await tx.bookReading.createMany({
        data: [{ userId, bookId, markedById: actor.id }],
        skipDuplicates: true,
      });
      if (created.count === 0) return;
    } else {
      const deleted = await tx.bookReading.deleteMany({ where: { userId, bookId } });
      if (deleted.count === 0) return;
    }

    await writeAudit(tx, actor, {
      action: read ? "reading.mark" : "reading.unmark",
      entityType: "reading",
      entityId: bookId,
      data: { userId },
    });
  });
}
