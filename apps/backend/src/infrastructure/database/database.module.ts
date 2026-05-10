import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { PrismaService } from './prisma.service';
import { RlsTransactionService } from '../../common/database/rls-transaction';

/**
 * Global database module. Exports the shared PrismaService and
 * RlsTransactionService so any BC can inject them without re-importing
 * DatabaseModule in its own feature module.
 */
@Global()
@Module({
  imports: [ClsModule],
  providers: [PrismaService, RlsTransactionService],
  exports: [PrismaService, RlsTransactionService],
})
export class DatabaseModule {}
