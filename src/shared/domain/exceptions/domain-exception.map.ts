import { HttpStatus } from '@nestjs/common';

export const DOMAIN_EXCEPTION_HTTP_MAP: Record<string, HttpStatus> = {
  ProfileNotFoundException: HttpStatus.NOT_FOUND,
  ProfileAlreadyExistsException: HttpStatus.CONFLICT,
  InsufficientCreditsException: HttpStatus.PAYMENT_REQUIRED,
  MissingTargetIdentityException: HttpStatus.BAD_REQUEST,
  IdentityNotFoundException: HttpStatus.NOT_FOUND,
  SelfLikeException: HttpStatus.BAD_REQUEST,
  AlreadyLikedException: HttpStatus.CONFLICT,
  LikeNotFoundException: HttpStatus.NOT_FOUND,
  InvalidLikeStateException: HttpStatus.BAD_REQUEST,
  MessageNotFoundException: HttpStatus.NOT_FOUND,
  MatchNotFoundException: HttpStatus.NOT_FOUND,
  SelfBlockException: HttpStatus.BAD_REQUEST,
  BlockTargetNotFoundException: HttpStatus.NOT_FOUND,
  AlreadyBlockedException: HttpStatus.CONFLICT,
  BlockNotFoundException: HttpStatus.NOT_FOUND,
};
