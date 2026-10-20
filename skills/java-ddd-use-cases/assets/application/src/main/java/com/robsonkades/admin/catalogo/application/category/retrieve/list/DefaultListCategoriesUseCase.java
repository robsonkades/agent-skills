package com.robsonkades.admin.catalogo.application.category.retrieve.list;

import com.robsonkades.admin.catalogo.domain.category.CategoryGateway;
import com.robsonkades.admin.catalogo.domain.pagination.SearchQuery;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;

import java.util.Objects;

public class DefaultListCategoriesUseCase extends ListCategoriesUseCase {

    private final CategoryGateway categoryGateway;

    public DefaultListCategoriesUseCase(final CategoryGateway categoryGateway) {
        this.categoryGateway = Objects.requireNonNull(categoryGateway);
    }

    @Override
    public Pagination<CategoryListOutput> execute(final SearchQuery aQuery) {
        return this.categoryGateway.findAll(aQuery)
                .map(CategoryListOutput::from);
    }
}
