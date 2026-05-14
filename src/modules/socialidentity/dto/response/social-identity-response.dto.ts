export class SocialIdentityResponseDto {
  id: string;
  name?: string;
  username?: string;
  profilePic?: string;
  isVerifiedUser?: boolean;
  followerCount?: number;
  isUserFollowBusiness?: boolean;
  isBusinessFollowUser?: boolean;
  platform: string;

  constructor(data: Partial<SocialIdentityResponseDto>) {
    Object.assign(this, data);
  }
}
