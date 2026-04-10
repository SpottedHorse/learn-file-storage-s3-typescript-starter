import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest, S3File } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from "crypto";
import { rm } from "fs/promises";



export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const UPLOAD_LIMIT = 1000 << 20
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  
  const video = await getVideo(cfg.db, videoId);
  
  if (!video) {
    throw new Error("Could not find video")
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  const formData = await req.formData();

  const file = formData.get('video');

  if (!(file instanceof File)) {
    throw new BadRequestError('Video file missing');
  }

  console.log(`max: ${UPLOAD_LIMIT}\nfileSize: ${file.size}`);

  if (file.size > UPLOAD_LIMIT) {
    throw new BadRequestError(
      `Video file exceeds the maximum allowed size of 1GB`
    );
  }
  
  const mediaType = file.type;
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Invalid file type. Only MP4 allowed.");
  }

  const fileName = `${randomHex(32)}.mp4`;
  const filePath = `./tmp/${fileName}`
  Bun.write(filePath, file);

  const s3file: S3File = cfg.s3Client.file(`src/${fileName}`);

  const localFile = Bun.file(filePath);

  await s3file.write(localFile, {type: "video/mp4"});

  video.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/src/${fileName}`;

  updateVideo(cfg.db, video);

  await rm(`./tmp/${fileName}`, { force: true });

  return respondWithJSON(200, null);
}

function randomHex(length: number) {
  return randomBytes(length).toString("base64url");
}