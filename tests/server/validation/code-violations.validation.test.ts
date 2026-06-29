import { describe, it, expect } from 'vitest';
import {
    cvParsedRowSchema,
    uploadCodeViolationsSchema,
    CV_UPLOAD_SOURCES,
} from '../../../database/validation/code-violations.validation';
import {
    insertCvUploadSchema,
    insertCvViolationSchema,
    insertCvNotificationSentSchema,
} from '../../../database/inserts/code-violations.insert';

describe('cvParsedRowSchema', () => {
    const valid = {
        recordNumber: 'CE-2026-00123',
        recordType: 'Code Enforcement',
        violationDate: '01/15/2026',
        rawAddress: '123 Main St, Port St. Lucie, FL',
        applicationName: 'Jane Doe',
        statusText: 'New',
        description: 'Overgrown lot',
    };

    it('cvParsedRowSchema — full valid row — passes', () => {
        expect(cvParsedRowSchema.safeParse(valid).success).toBe(true);
    });

    it('cvParsedRowSchema — only required fields — passes and defaults optionals to ""', () => {
        const parsed = cvParsedRowSchema.parse({
            recordNumber: 'CE-1',
            rawAddress: '1 A St',
        });
        expect(parsed.recordType).toBe('');
        expect(parsed.violationDate).toBe('');
        expect(parsed.applicationName).toBe('');
        expect(parsed.statusText).toBe('');
        expect(parsed.description).toBe('');
    });

    it('cvParsedRowSchema — trims surrounding whitespace on required fields', () => {
        const parsed = cvParsedRowSchema.parse({
            recordNumber: '  CE-2  ',
            rawAddress: '  9 B St  ',
        });
        expect(parsed.recordNumber).toBe('CE-2');
        expect(parsed.rawAddress).toBe('9 B St');
    });

    it('cvParsedRowSchema — missing recordNumber — rejects', () => {
        const { recordNumber, ...rest } = valid;
        expect(cvParsedRowSchema.safeParse(rest).success).toBe(false);
    });

    it('cvParsedRowSchema — empty/whitespace recordNumber — rejects', () => {
        expect(cvParsedRowSchema.safeParse({ ...valid, recordNumber: '   ' }).success).toBe(
            false,
        );
    });

    it('cvParsedRowSchema — missing rawAddress — rejects (a bare junk line is skipped)', () => {
        const { rawAddress, ...rest } = valid;
        expect(cvParsedRowSchema.safeParse(rest).success).toBe(false);
    });

    it('cvParsedRowSchema — empty/whitespace rawAddress — rejects', () => {
        expect(cvParsedRowSchema.safeParse({ ...valid, rawAddress: '  ' }).success).toBe(false);
    });
});

describe('uploadCodeViolationsSchema', () => {
    it('uploadCodeViolationsSchema — empty body — defaults source to "manual"', () => {
        expect(uploadCodeViolationsSchema.parse({}).source).toBe('manual');
    });

    it.each(CV_UPLOAD_SOURCES)(
        'uploadCodeViolationsSchema — source "%s" — passes',
        (source) => {
            expect(uploadCodeViolationsSchema.safeParse({ source }).success).toBe(true);
        },
    );

    it('uploadCodeViolationsSchema — unknown source — rejects', () => {
        expect(uploadCodeViolationsSchema.safeParse({ source: 'api' }).success).toBe(false);
    });
});

describe('code-violation insert schemas', () => {
    it('insertCvUploadSchema — valid minimal upload — passes', () => {
        expect(insertCvUploadSchema.safeParse({ fileName: 'jan.csv' }).success).toBe(true);
    });

    it('insertCvUploadSchema — out-of-set status — rejects', () => {
        expect(
            insertCvUploadSchema.safeParse({ fileName: 'jan.csv', status: 'done' }).success,
        ).toBe(false);
    });

    it('insertCvViolationSchema — out-of-set processingStatus — rejects', () => {
        expect(
            insertCvViolationSchema.safeParse({
                recordNumber: 'CE-3',
                rawAddress: '2 C St',
                processingStatus: 'queued',
            }).success,
        ).toBe(false);
    });

    it('insertCvNotificationSentSchema — out-of-set channel — rejects', () => {
        const validRow = {
            violationId: '11111111-1111-1111-1111-111111111111',
            userId: '22222222-2222-2222-2222-222222222222',
            companyId: '33333333-3333-3333-3333-333333333333',
        };
        expect(insertCvNotificationSentSchema.safeParse(validRow).success).toBe(true);
        expect(
            insertCvNotificationSentSchema.safeParse({ ...validRow, channel: 'sms' }).success,
        ).toBe(false);
    });
});
