import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './markdown';

describe('isSafeUrl', () => {
	it('should return true for valid HTTP/HTTPS urls', () => {
		expect(isSafeUrl('http://example.com')).toBe(true);
		expect(isSafeUrl('https://example.com')).toBe(true);
		expect(isSafeUrl('https://example.com/path?query=1')).toBe(true);
	});

	it('should return true for mailto and tel links', () => {
		expect(isSafeUrl('mailto:test@example.com')).toBe(true);
		expect(isSafeUrl('tel:+1234567890')).toBe(true);
	});

	it('should return true for relative paths', () => {
		expect(isSafeUrl('/relative/path')).toBe(true);
		expect(isSafeUrl('/')).toBe(true);
	});

	it('should handle uppercase letters in protocols', () => {
		expect(isSafeUrl('HTTPS://example.com')).toBe(true);
		expect(isSafeUrl('MaIlTo:test@example.com')).toBe(true);
		expect(isSafeUrl('TEL:+123')).toBe(true);
	});

	it('should handle whitespace around the url', () => {
		expect(isSafeUrl('  https://example.com  ')).toBe(true);
		expect(isSafeUrl('\nhttps://example.com\t')).toBe(true);
	});

	it('should return false for javascript urls', () => {
		expect(isSafeUrl('javascript:alert(1)')).toBe(false);
		expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false);
		expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
	});

	it('should return false for vbscript urls', () => {
		expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
	});

	it('should return false for data urls', () => {
		expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
	});

	it('should return false for file urls', () => {
		expect(isSafeUrl('file:///etc/passwd')).toBe(false);
	});

	it('should return false for unsupported protocols', () => {
		expect(isSafeUrl('ftp://example.com')).toBe(false);
		expect(isSafeUrl('ws://example.com')).toBe(false);
		expect(isSafeUrl('custom://example.com')).toBe(false);
		expect(isSafeUrl('example.com')).toBe(false);
	});
});
