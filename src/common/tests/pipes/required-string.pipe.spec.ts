import { BadRequestException } from '@nestjs/common';
import {
  RequiredStringPipe,
  RequiredString,
} from '../../pipes/required-string.pipe';

describe('RequiredStringPipe', () => {
  let pipe: RequiredStringPipe;

  describe('with custom parameter name', () => {
    beforeEach(() => {
      pipe = new RequiredStringPipe('username');
    });

    it('should be defined', () => {
      expect(pipe).toBeDefined();
    });

    it('should accept valid string', () => {
      const result = pipe.transform('validString');
      expect(result).toBe('validString');
    });

    it('should trim whitespace from valid string', () => {
      const result = pipe.transform('  trimmed  ');
      expect(result).toBe('trimmed');
    });

    it('should throw BadRequestException for undefined value', () => {
      expect(() => pipe.transform(undefined)).toThrow(
        new BadRequestException('username is required'),
      );
    });

    it('should throw BadRequestException for null value', () => {
      expect(() => pipe.transform(null)).toThrow(
        new BadRequestException('username is required'),
      );
    });

    it('should throw BadRequestException for non-string value (number)', () => {
      expect(() => pipe.transform(123)).toThrow(
        new BadRequestException('username must be a string'),
      );
    });

    it('should throw BadRequestException for non-string value (object)', () => {
      expect(() => pipe.transform({ key: 'value' })).toThrow(
        new BadRequestException('username must be a string'),
      );
    });

    it('should throw BadRequestException for non-string value (array)', () => {
      expect(() => pipe.transform(['array'])).toThrow(
        new BadRequestException('username must be a string'),
      );
    });

    it('should throw BadRequestException for empty string', () => {
      expect(() => pipe.transform('')).toThrow(
        new BadRequestException('username cannot be empty'),
      );
    });

    it('should throw BadRequestException for whitespace-only string', () => {
      expect(() => pipe.transform('   ')).toThrow(
        new BadRequestException('username cannot be empty'),
      );
    });

    it('should throw BadRequestException for tab-only string', () => {
      expect(() => pipe.transform('\t\t')).toThrow(
        new BadRequestException('username cannot be empty'),
      );
    });

    it('should accept string with spaces in the middle', () => {
      const result = pipe.transform('  hello world  ');
      expect(result).toBe('hello world');
    });
  });

  describe('with default parameter name', () => {
    beforeEach(() => {
      pipe = new RequiredStringPipe();
    });

    it('should use default parameter name in error messages', () => {
      expect(() => pipe.transform(undefined)).toThrow(
        new BadRequestException('parameter is required'),
      );
    });

    it('should use default parameter name for type error', () => {
      expect(() => pipe.transform(123)).toThrow(
        new BadRequestException('parameter must be a string'),
      );
    });

    it('should use default parameter name for empty error', () => {
      expect(() => pipe.transform('')).toThrow(
        new BadRequestException('parameter cannot be empty'),
      );
    });
  });

  describe('RequiredString helper function', () => {
    it('should create pipe with custom name', () => {
      const pipe = RequiredString('email');
      expect(pipe).toBeInstanceOf(RequiredStringPipe);
      expect(() => pipe.transform(undefined)).toThrow(
        new BadRequestException('email is required'),
      );
    });

    it('should create pipe with default name', () => {
      const pipe = RequiredString();
      expect(pipe).toBeInstanceOf(RequiredStringPipe);
      expect(() => pipe.transform(undefined)).toThrow(
        new BadRequestException('parameter is required'),
      );
    });

    it('should work with valid values', () => {
      const pipe = RequiredString('name');
      const result = pipe.transform('John Doe');
      expect(result).toBe('John Doe');
    });
  });
});
