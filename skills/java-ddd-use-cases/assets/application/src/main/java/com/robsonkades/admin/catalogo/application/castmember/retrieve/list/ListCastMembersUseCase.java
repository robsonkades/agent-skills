package com.robsonkades.admin.catalogo.application.castmember.retrieve.list;

import com.robsonkades.admin.catalogo.application.UseCase;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;
import com.robsonkades.admin.catalogo.domain.pagination.SearchQuery;

public sealed abstract class ListCastMembersUseCase
        extends UseCase<SearchQuery, Pagination<CastMemberListOutput>>
        permits DefaultListCastMembersUseCase {
}
