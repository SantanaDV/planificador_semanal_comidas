from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    preferences: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ingredients: Mapped[list[Ingredient]] = relationship(back_populates="user", cascade="all, delete-orphan")
    recipes: Mapped[list[Recipe]] = relationship(back_populates="user", cascade="all, delete-orphan")
    menus: Mapped[list[WeeklyMenu]] = relationship(back_populates="user", cascade="all, delete-orphan")


class IngredientCategory(Base):
    __tablename__ = "ingredient_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ingredients: Mapped[list["Ingredient"]] = relationship(back_populates="category_ref")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(80))
    expires_at: Mapped[date | None] = mapped_column(Date)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("ingredient_categories.id", ondelete="SET NULL"))
    unit: Mapped[str | None] = mapped_column(String(40))
    legacy_category: Mapped[str | None] = mapped_column("category", String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="ingredients")
    category_ref: Mapped[IngredientCategory | None] = relationship(back_populates="ingredients")

    @property
    def category(self) -> str | None:
        return self.category_ref.name if self.category_ref else self.legacy_category


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    ingredients: Mapped[list[str]] = mapped_column(JSON, default=list)
    steps: Mapped[list[str]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    prep_time_minutes: Mapped[int] = mapped_column(Integer, default=25)
    difficulty: Mapped[str] = mapped_column(String(40), default="Facil")
    servings: Mapped[int] = mapped_column(Integer, default=2)
    image_url: Mapped[str | None] = mapped_column(Text)
    image_source_url: Mapped[str | None] = mapped_column(Text)
    image_alt_text: Mapped[str | None] = mapped_column(Text)
    image_lookup_status: Mapped[str | None] = mapped_column(String(40))
    image_lookup_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), default="ai")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="recipes")


class WeeklyMenu(Base):
    __tablename__ = "weekly_menus"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    generated_from_ingredients: Mapped[list[str]] = mapped_column(JSON, default=list)
    ai_model: Mapped[str] = mapped_column(String(120), default="fallback")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="menus")
    items: Mapped[list[MenuItem]] = relationship(
        back_populates="menu",
        cascade="all, delete-orphan",
        order_by="MenuItem.day_index, MenuItem.meal_type",
    )


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    menu_id: Mapped[str] = mapped_column(ForeignKey("weekly_menus.id", ondelete="CASCADE"), nullable=False)
    recipe_id: Mapped[str | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"))
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    day_name: Mapped[str] = mapped_column(String(24), nullable=False)
    meal_type: Mapped[str] = mapped_column(String(24), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    menu: Mapped[WeeklyMenu] = relationship(back_populates="items")
    recipe: Mapped[Recipe | None] = relationship()


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    stack_trace: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
