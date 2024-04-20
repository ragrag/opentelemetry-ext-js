import 'mocha';
import expect from 'expect';
import { context, ROOT_CONTEXT, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { TypeormInstrumentation, TypeormInstrumentationConfig } from '../src';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(new TypeormInstrumentation());
import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';

describe('QueryBuilder', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('getManyAndCount', async () => {
        const connectionOptions = defaultOptions();
        const connection = await typeorm.createConnection(connectionOptions);
        const queryBuilder = connection.getRepository(User).createQueryBuilder('user');
        const users = await queryBuilder.where('user.id = :userId', { userId: '1' }).getManyAndCount();
        expect(users.length).toBe(2);
        const typeOrmSpans = getTestSpans();
        expect(typeOrmSpans.length).toBe(1);
        expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
        const attributes = typeOrmSpans[0].attributes;
        expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(connectionOptions.type);
        expect(attributes[SemanticAttributes.DB_USER]).toBe(connectionOptions.username);
        expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(connectionOptions.host);
        expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(connectionOptions.port);
        expect(attributes[SemanticAttributes.DB_NAME]).toBe(connectionOptions.database);
        expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
        expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
            'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId'
        );
        await connection.close();
    });
});

describe('requireParentSpan', () => {
    beforeEach(() => {
        instrumentation.disable();
        instrumentation.setConfig({
            requireParentSpan: true,
        } as TypeormInstrumentationConfig);
        instrumentation.enable();
    });

    it('should not have spans', async () => {
        const connection = await typeorm.createConnection({
            name: 'qbRequireParentSpanCon',
            type: 'sqlite',
            database: 'qbRequireParentSpan.db',
            entities: [User],
            synchronize: true,
        });

        context.with(ROOT_CONTEXT, async () => {
            const queryBuilder = connection.getRepository(User).createQueryBuilder('user');
            await queryBuilder.where('user.id = :userId', { userId: '1' }).getManyAndCount();
            await connection.close();
            const spans = getTestSpans();
            expect(spans.length).toBe(0);
        });
    });
});
