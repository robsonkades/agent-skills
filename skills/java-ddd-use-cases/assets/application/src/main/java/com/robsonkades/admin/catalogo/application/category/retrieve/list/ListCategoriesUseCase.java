package com.robsonkades.admin.catalogo.application.category.retrieve.list;

import com.robsonkades.admin.catalogo.application.UseCase;
import com.robsonkades.admin.catalogo.domain.pagination.SearchQuery;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;

public abstract class ListCategoriesUseCase
        extends UseCase<SearchQuery, Pagination<CategoryListOutput>> {
}
