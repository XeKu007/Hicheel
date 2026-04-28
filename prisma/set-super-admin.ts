import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "xeku672@gmail.com";

  const members = await prisma.member.findMany({
    where: { email },
  });

  if (members.length === 0) {
    console.log("❌ Member not found with email:", email);
    return;
  }

  for (const member of members) {
    await prisma.member.update({
      where: { id: member.id },
      data: { role: "SUPER_ADMIN" },
    });
    console.log(`✅ Updated member ${member.id} to SUPER_ADMIN`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
