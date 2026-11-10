import {
  GetDishPhotoImageParams,
  ListDishPhotosResponse,
  UploadDishPhotoBody,
  UploadDishPhotoResponse,
} from "@workspace/api-zod";
import { db, dishPhotosTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

type ImageParseResult =
  | { ok: true; mimeType: string; base64: string; bytes: Buffer }
  | { ok: false; status: number; error: string };

function hasMatchingImageSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }

  return (
    mimeType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function parseImageDataUrl(value: string): ImageParseResult {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) {
    return {
      ok: false,
      status: 415,
      error: "Upload a JPEG, PNG, or WebP image.",
    };
  }

  const mimeType = match[1];
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  const normalizedInput = base64.replace(/=+$/, "");
  const normalizedBytes = bytes.toString("base64").replace(/=+$/, "");

  if (bytes.length === 0 || normalizedInput !== normalizedBytes) {
    return {
      ok: false,
      status: 400,
      error: "The photo data is invalid. Please choose another image.",
    };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Photos must be 3 MB or smaller.",
    };
  }

  if (!hasMatchingImageSignature(mimeType, bytes)) {
    return {
      ok: false,
      status: 400,
      error: "The photo content does not match its image type.",
    };
  }

  return { ok: true, mimeType, base64, bytes };
}

function toDishPhotoResponse(item: {
  id: number;
  title: string;
  caption: string;
  createdAt: Date;
}) {
  return {
    id: item.id,
    title: item.title,
    caption: item.caption,
    imageUrl: `/api/dishes/${item.id}/image`,
    createdAt: item.createdAt.toISOString(),
  };
}

router.get("/dishes", async (req, res): Promise<void> => {
  try {
    const photos = await db
      .select({
        id: dishPhotosTable.id,
        title: dishPhotosTable.title,
        caption: dishPhotosTable.caption,
        createdAt: dishPhotosTable.createdAt,
      })
      .from(dishPhotosTable)
      .orderBy(desc(dishPhotosTable.createdAt), desc(dishPhotosTable.id));

    res.json(ListDishPhotosResponse.parse(photos.map(toDishPhotoResponse)));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Failed to list dish photos",
    );
    res.status(500).json({ error: "Photos could not be loaded. Please try again." });
  }
});

router.post("/dishes", async (req, res): Promise<void> => {
  const parsed = UploadDishPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Enter a title and choose a JPEG, PNG, or WebP image under 3 MB.",
    });
    return;
  }

  const title = parsed.data.title.trim();
  if (!title) {
    res.status(400).json({ error: "Add a short title for your dish photo." });
    return;
  }

  const image = parseImageDataUrl(parsed.data.image);
  if (!image.ok) {
    res.status(image.status).json({ error: image.error });
    return;
  }

  try {
    const [saved] = await db
      .insert(dishPhotosTable)
      .values({
        title,
        caption: parsed.data.caption?.trim() || "",
        mimeType: image.mimeType,
        imageBase64: image.base64,
      })
      .returning({
        id: dishPhotosTable.id,
        title: dishPhotosTable.title,
        caption: dishPhotosTable.caption,
        createdAt: dishPhotosTable.createdAt,
      });

    res
      .status(201)
      .json(UploadDishPhotoResponse.parse(toDishPhotoResponse(saved)));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Failed to save dish photo",
    );
    res.status(500).json({ error: "The photo could not be saved. Please try again." });
  }
});

router.get("/dishes/:id/image", async (req, res): Promise<void> => {
  const params = GetDishPhotoImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Dish photo not found." });
    return;
  }

  try {
    const [photo] = await db
      .select({
        mimeType: dishPhotosTable.mimeType,
        imageBase64: dishPhotosTable.imageBase64,
      })
      .from(dishPhotosTable)
      .where(eq(dishPhotosTable.id, params.data.id))
      .limit(1);

    if (!photo) {
      res.status(404).json({ error: "Dish photo not found." });
      return;
    }

    const bytes = Buffer.from(photo.imageBase64, "base64");
    res
      .status(200)
      .set("Content-Type", photo.mimeType)
      .set("Content-Length", String(bytes.byteLength))
      .set("Cache-Control", "public, max-age=3600")
      .set("X-Content-Type-Options", "nosniff")
      .send(bytes);
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Failed to load dish photo image",
    );
    res.status(500).json({ error: "The photo could not be loaded. Please try again." });
  }
});

export default router;
