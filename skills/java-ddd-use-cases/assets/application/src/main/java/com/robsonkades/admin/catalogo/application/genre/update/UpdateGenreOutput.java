package com.robsonkades.admin.catalogo.application.genre.update;

import com.robsonkades.admin.catalogo.domain.genre.Genre;

public record UpdateGenreOutput(String id) {

    public static UpdateGenreOutput from(final Genre aGenre) {
        return new UpdateGenreOutput(aGenre.getId().getValue());
    }
}
