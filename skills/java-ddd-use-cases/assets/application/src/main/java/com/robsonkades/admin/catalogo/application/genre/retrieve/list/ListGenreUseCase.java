package com.robsonkades.admin.catalogo.application.genre.retrieve.list;

import com.robsonkades.admin.catalogo.application.UseCase;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;
import com.robsonkades.admin.catalogo.domain.pagination.SearchQuery;

public abstract class ListGenreUseCase
        extends UseCase<SearchQuery, Pagination<GenreListOutput>> {
}
