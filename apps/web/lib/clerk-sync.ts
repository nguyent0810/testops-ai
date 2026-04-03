import { and, eq } from "drizzle-orm";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { UserJSON } from "@clerk/backend";
import type { Db } from "@repo/db";
import {
  organizationMemberships,
  organizations,
  users,
} from "@repo/db";

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Synthetic `*.users.clerk.local` values are identity placeholders for NOT NULL `users.email` only;
 * do not use them for outbound email or marketing.
 */
function safeEmail(clerkUserId: string, raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (trimmed.length > 0 && EMAIL_LIKE.test(trimmed)) {
    return trimmed;
  }
  return `${clerkUserId}@users.clerk.local`;
}

function primaryEmail(u: UserJSON): string {
  const list = u.email_addresses ?? [];
  const primary = list.find((e) => e.id === u.primary_email_address_id);
  const addr = primary?.email_address ?? list[0]?.email_address;
  return safeEmail(u.id, addr);
}

function displayName(u: UserJSON): string | null {
  const parts = [u.first_name, u.last_name].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  if (u.username) return u.username;
  return null;
}

function safeOrgSlug(orgId: string, raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.length > 0) return s;
  return `org-${orgId.replace(/[^a-z0-9]+/gi, "-").slice(-24) || "unknown"}`;
}

export async function handleClerkWebhook(db: Db, evt: WebhookEvent): Promise<void> {
  const now = new Date();

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const u = evt.data;
      const email = primaryEmail(u);
      const name = displayName(u);
      await db
        .insert(users)
        .values({
          id: u.id,
          email,
          name,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, name, updatedAt: now },
        });
      break;
    }
    case "user.deleted": {
      const id = evt.data.id;
      if (id) {
        await db.delete(users).where(eq(users.id, id));
      }
      break;
    }
    case "organization.created":
    case "organization.updated": {
      const o = evt.data;
      const slug = safeOrgSlug(o.id, o.slug);
      await db
        .insert(organizations)
        .values({
          id: o.id,
          name: o.name,
          slug,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: organizations.id,
          set: {
            name: o.name,
            slug,
            updatedAt: now,
          },
        });
      break;
    }
    case "organization.deleted": {
      const id = evt.data.id;
      if (id) {
        await db.delete(organizations).where(eq(organizations.id, id));
      }
      break;
    }
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const m = evt.data;
      const org = m.organization;
      const pu = m.public_user_data;
      const orgSlug = safeOrgSlug(org.id, org.slug);
      const userEmail = safeEmail(pu.user_id, pu.identifier);
      const userName =
        [pu.first_name, pu.last_name].filter(Boolean).join(" ") || null;

      await db
        .insert(organizations)
        .values({
          id: org.id,
          name: org.name,
          slug: orgSlug,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: organizations.id,
          set: {
            name: org.name,
            slug: orgSlug,
            updatedAt: now,
          },
        });

      await db
        .insert(users)
        .values({
          id: pu.user_id,
          email: userEmail,
          name: userName,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userEmail,
            name: userName,
            updatedAt: now,
          },
        });

      await db
        .insert(organizationMemberships)
        .values({
          organizationId: org.id,
          userId: pu.user_id,
          role: m.role,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [organizationMemberships.organizationId, organizationMemberships.userId],
          set: { role: m.role, updatedAt: now },
        });
      break;
    }
    case "organizationMembership.deleted": {
      const m = evt.data;
      await db
        .delete(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, m.organization.id),
            eq(organizationMemberships.userId, m.public_user_data.user_id),
          ),
        );
      break;
    }
    default:
      break;
  }
}
