package com.robsonkades.admin.catalogo.application.video.retrieve.list;

import com.robsonkades.admin.catalogo.application.UseCase;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;
import com.robsonkades.admin.catalogo.domain.video.VideoSearchQuery;

public abstract class ListVideosUseCase
        extends UseCase<VideoSearchQuery, Pagination<VideoListOutput>> {
}
